/**
 * Gate de ENTITLEMENTS — semántica de `salon_has_feature` (sub-11, requisito 1).
 *
 * `app.salon_has_feature(uuid, text)` (SQL, migración 20260718100000_salon_features)
 * y su ESPEJO en TypeScript `salonHasFeature` (`@/lib/salon-features`) deben codificar
 * la MISMA regla OPT-IN (deny-by-default de negocio): un add-on está activo para un
 * salón SOLO si existe su fila en `public.salon_features` Y `enabled = true`. En
 * concreto, la tabla de verdad que ambos lados comparten:
 *
 *   · fila presente y enabled = true   ⇒ true   (contratado y activo)
 *   · fila presente y enabled = false  ⇒ false  (contratado pero pausado/impago)
 *   · NO existe la fila                ⇒ false  (no contratado — la ausencia es el gate)
 *   · feature fuera del catálogo/otro  ⇒ false  (no hay match)
 *
 * Este archivo blinda esa coherencia en dos planos, como `normalize-phone-sql-coherence`:
 *
 *   A) COMPORTAMIENTO — ejercita `salonHasFeature` (TS) contra un doble mínimo de
 *      Supabase y comprueba las tres/cuatro ramas de la tabla de verdad, que el
 *      lookup se acota SIEMPRE por `salon_id` (no cruza de salón) y que un error de
 *      la consulta se PROPAGA (no se enmascara como `false`).
 *
 *   B) FUENTE — lee la migración REAL y verifica que `app.salon_has_feature` sigue
 *      codificando esas mismas reglas: `exists(...)`, `sf.enabled`, y —clave contra
 *      el "invalid input value for enum"— que castea la COLUMNA a texto
 *      (`sf.feature::text = p_feature`), nunca el parámetro al enum; además, el
 *      endurecimiento del helper (SECURITY DEFINER + STABLE + search_path='' +
 *      revoke a anon) que permite reutilizarlo dentro de políticas RLS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  LOYALTY_FEATURE_DISABLED_MESSAGE,
  listSalonFeatures,
  salonFeatureFlags,
  salonHasFeature,
} from "@/lib/salon-features";
import type { SalonFeature } from "@/types/database";

// ─────────────────────────────────────────────────────────────────────────────
// Doble MÍNIMO de Supabase para `salonHasFeature`, que hace exactamente:
//   from("salon_features").select("enabled")
//     .eq("salon_id", …).eq("feature", …).eq("enabled", true).maybeSingle()
// El doble acumula los `.eq` y, en `maybeSingle`, devuelve la primera fila que los
// cumple (o null). Un error opcional modela un fallo de PostgREST.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

function makeClient(rows: Row[], error: { message: string } | null = null) {
  function builder() {
    const filters: Array<(r: Row) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return b;
      },
      maybeSingle: () => {
        const match = rows.find((r) => filters.every((f) => f(r))) ?? null;
        return Promise.resolve({ data: error === null ? match : null, error });
      },
    };
    return b;
  }
  return { from: () => builder() };
}

/** Cliente tipado para `salonHasFeature` sin arrastrar todo el tipo de Supabase. */
type Client = Parameters<typeof salonHasFeature>[0];
const asClient = (rows: Row[], error: { message: string } | null = null): Client =>
  makeClient(rows, error) as unknown as Client;

// ─────────────────────────────────────────────────────────────────────────────
// Doble MÍNIMO para `listSalonFeatures`, que hace:
//   from("salon_features").select("feature, enabled").eq("salon_id", …)
// y AWAITA el builder (sin `.maybeSingle`): devuelve la LISTA de filas que cumplen
// los `.eq`. El builder es un thenable que resuelve `{ data, error }`.
// ─────────────────────────────────────────────────────────────────────────────
function makeListClient(rows: Row[], error: { message: string } | null = null) {
  function builder() {
    const filters: Array<(r: Row) => boolean> = [];
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return b;
      },
      then: (
        resolve: (v: {
          data: Row[] | null;
          error: { message: string } | null;
        }) => unknown,
      ) => {
        const data = error === null ? rows.filter((r) => filters.every((f) => f(r))) : null;
        return Promise.resolve(resolve({ data, error }));
      },
    };
    return b;
  }
  return { from: () => builder() };
}

/** Cliente tipado para `listSalonFeatures` sin arrastrar todo el tipo de Supabase. */
type ListClient = Parameters<typeof listSalonFeatures>[0];
const asListClient = (
  rows: Row[],
  error: { message: string } | null = null,
): ListClient => makeListClient(rows, error) as unknown as ListClient;

const SALON_A = "salon-a";
const SALON_B = "salon-b";
const LOYALTY: SalonFeature = "loyalty";
const POS: SalonFeature = "pos";

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO — la tabla de verdad OPT-IN del espejo TS.
// ─────────────────────────────────────────────────────────────────────────────
describe("salonHasFeature — tabla de verdad OPT-IN", () => {
  it("fila presente y enabled=true ⇒ true (contratado y activo)", async () => {
    const client = asClient([{ salon_id: SALON_A, feature: "loyalty", enabled: true }]);
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).resolves.toBe(true);
  });

  it("fila presente pero enabled=false ⇒ false (contratado pero pausado)", async () => {
    const client = asClient([{ salon_id: SALON_A, feature: "loyalty", enabled: false }]);
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).resolves.toBe(false);
  });

  it("NO existe la fila ⇒ false (no contratado — la ausencia ES el gate)", async () => {
    const client = asClient([]); // sin ninguna fila de entitlements
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).resolves.toBe(false);
  });

  it("otro add-on activo NO habilita el consultado ('pos' activo ⇏ 'loyalty')", async () => {
    const client = asClient([{ salon_id: SALON_A, feature: "pos", enabled: true }]);
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).resolves.toBe(false);
    // …pero el que SÍ está sí devuelve true (el doble discrimina por feature).
    await expect(salonHasFeature(client, SALON_A, POS)).resolves.toBe(true);
  });

  it("el lookup se acota por salon_id: la fila de OTRO salón no cuenta", async () => {
    // Solo el salón B tiene 'loyalty' activo; preguntar por A ⇒ false (no se lee B).
    const client = asClient([{ salon_id: SALON_B, feature: "loyalty", enabled: true }]);
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).resolves.toBe(false);
    await expect(salonHasFeature(client, SALON_B, LOYALTY)).resolves.toBe(true);
  });

  it("un error de la consulta se PROPAGA (no se enmascara como false)", async () => {
    // Que un fallo de infraestructura NO se confunda con "no contratado" es crítico:
    // el llamador lo traduce a un error `internal`/500, no a un gate cerrado en silencio.
    const client = asClient([], { message: "boom" });
    await expect(salonHasFeature(client, SALON_A, LOYALTY)).rejects.toMatchObject({
      message: "boom",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A') LOTE — `listSalonFeatures` lee los N add-ons de una vez y DISTINGUE los tres
//     estados que la vista de Complementos necesita. A diferencia de `salonHasFeature`,
//     NO colapsa "pausado" con "no contratado": conserva el `enabled` de cada fila.
// ─────────────────────────────────────────────────────────────────────────────
describe("listSalonFeatures — mapa feature→enabled (los tres estados de la UI)", () => {
  it("mapea cada fila a su enabled y DISTINGUE activo (true) de pausado (false)", async () => {
    const client = asListClient([
      { salon_id: SALON_A, feature: "loyalty", enabled: true },
      { salon_id: SALON_A, feature: "pos", enabled: false },
    ]);
    const map = await listSalonFeatures(client, SALON_A);
    expect(map.get("loyalty")).toBe(true); // contratado y activo
    expect(map.get("pos")).toBe(false); // contratado pero pausado (≠ no contratado)
  });

  it("un add-on SIN fila queda AUSENTE del mapa (la ausencia = no contratado)", async () => {
    const client = asListClient([
      { salon_id: SALON_A, feature: "loyalty", enabled: true },
    ]);
    const map = await listSalonFeatures(client, SALON_A);
    expect(map.has("client_app")).toBe(false);
    expect(map.get("client_app")).toBeUndefined();
  });

  it("se acota por salon_id: las filas de OTRO salón no entran en el mapa", async () => {
    const client = asListClient([
      { salon_id: SALON_A, feature: "loyalty", enabled: true },
      { salon_id: SALON_B, feature: "pos", enabled: true },
    ]);
    const map = await listSalonFeatures(client, SALON_A);
    expect(map.has("loyalty")).toBe(true);
    expect(map.has("pos")).toBe(false); // esa fila era del salón B
  });

  it("sin ninguna fila ⇒ mapa vacío (ningún add-on), no un error", async () => {
    const client = asListClient([]);
    const map = await listSalonFeatures(client, SALON_A);
    expect(map.size).toBe(0);
  });

  it("un error de la consulta se PROPAGA (no se enmascara como mapa vacío)", async () => {
    const client = asListClient([], { message: "boom" });
    await expect(listSalonFeatures(client, SALON_A)).rejects.toMatchObject({
      message: "boom",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A'') SNAPSHOT — `salonFeatureFlags` reduce las N filas a un booleano por feature con
//      todas las claves presentes. A diferencia de `listSalonFeatures` (que preserva los
//      tres estados para la vista de Complementos), COLAPSA "en pausa" a `false`: es el
//      dato que siembra el gate de UI para ocultar Facturación / gráficas de ingresos.
//      El reductor puro se prueba a fondo en `salon-feature-flags.test.ts`; aquí se fija
//      el CABLEADO DB→snapshot (misma consulta, mismo acotado por salón, misma propagación).
// ─────────────────────────────────────────────────────────────────────────────
describe("salonFeatureFlags — snapshot booleano del gate (DB → flags)", () => {
  it("colapsa contratado/pausado/ausente a un booleano por feature", async () => {
    const client = asListClient([
      { salon_id: SALON_A, feature: "pos", enabled: true }, // activo ⇒ true
      { salon_id: SALON_A, feature: "loyalty", enabled: false }, // en pausa ⇒ false
      // client_app / staff_app / ai_receptionist ausentes ⇒ false
    ]);
    await expect(salonFeatureFlags(client, SALON_A)).resolves.toEqual({
      loyalty: false,
      client_app: false,
      staff_app: false,
      ai_receptionist: false,
      pos: true,
    });
  });

  it("sin ninguna fila ⇒ todas las flags en false (deny-by-default)", async () => {
    const client = asListClient([]);
    const flags = await salonFeatureFlags(client, SALON_A);
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });

  it("se acota por salon_id: las filas de OTRO salón no encienden ninguna flag", async () => {
    // 'pos' activo solo en el salón B; preguntar por A no debe encenderlo.
    const client = asListClient([{ salon_id: SALON_B, feature: "pos", enabled: true }]);
    await expect(salonFeatureFlags(client, SALON_A)).resolves.toMatchObject({ pos: false });
    await expect(salonFeatureFlags(client, SALON_B)).resolves.toMatchObject({ pos: true });
  });

  it("un error de la consulta se PROPAGA (no se enmascara como snapshot vacío)", async () => {
    const client = asListClient([], { message: "boom" });
    await expect(salonFeatureFlags(client, SALON_A)).rejects.toMatchObject({
      message: "boom",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) FUENTE — la SQL real sigue codificando la misma regla que el espejo TS.
// ─────────────────────────────────────────────────────────────────────────────
describe("salon_has_feature — anclajes semánticos en la migración real", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718100000_salon_features.sql"),
    "utf8",
  );

  // Aísla el CUERPO de la función (de la firma al cierre `$$;`) para no anclar sobre
  // los comentarios del encabezado, que también mencionan 'enabled'/'exists'.
  const fnBody = (() => {
    const start = migrationSql.indexOf("create or replace function app.salon_has_feature");
    const end = migrationSql.indexOf("$$;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return migrationSql.slice(start, end);
  })();

  it("firma con p_feature TEXT (no el enum): fuera de catálogo ⇒ false, no error", () => {
    expect(fnBody).toMatch(/p_feature\s+text/i);
  });

  it("regla OPT-IN: exige fila presente Y enabled (exists + sf.enabled)", () => {
    expect(fnBody.toLowerCase()).toContain("exists");
    expect(fnBody).toMatch(/from public\.salon_features sf/);
    expect(fnBody).toMatch(/sf\.enabled/);
  });

  it("castea la COLUMNA a texto (sf.feature::text = p_feature), NUNCA el parámetro al enum", () => {
    // Es lo que hace que un feature 'typo' devuelva false en vez de "invalid input
    // value for enum". Si alguien invirtiera el cast (p_feature::salon_feature), este
    // ancla lo delata.
    expect(fnBody).toMatch(/sf\.feature::text\s*=\s*p_feature/);
    expect(fnBody).not.toMatch(/p_feature::/); // el parámetro nunca se castea al enum
  });

  it("acota por salon_id (aislamiento del lookup dentro del helper)", () => {
    expect(fnBody).toMatch(/sf\.salon_id\s*=\s*p_salon_id/);
  });

  it("endurecido para reuso en políticas RLS: SECURITY DEFINER + STABLE + search_path=''", () => {
    expect(fnBody.toLowerCase()).toContain("security definer");
    expect(fnBody.toLowerCase()).toContain("stable");
    expect(fnBody).toMatch(/set search_path\s*=\s*''/);
  });

  it("EXECUTE revocado a anon/public y concedido solo a authenticated (gate no expuesto sin login)", () => {
    expect(migrationSql).toMatch(
      /revoke execute on function app\.salon_has_feature\(uuid, text\) from anon, public/,
    );
    expect(migrationSql).toMatch(
      /grant\s+execute on function app\.salon_has_feature\(uuid, text\) to authenticated/,
    );
  });

  it("el mensaje de dominio del gate cerrado es único y estable (espejo TS ↔ copy)", () => {
    // El código que traduce el gate a 403 usa esta constante; fijarla evita que el
    // copy diverja entre módulos (loyalty/server y customers/account la comparten).
    expect(LOYALTY_FEATURE_DISABLED_MESSAGE).toBe(
      "Este salón no tiene contratada la fidelización",
    );
  });
});
