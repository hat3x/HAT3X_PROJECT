/**
 * Aislamiento multi-tenant de ENTITLEMENTS y BRANDING PRIVADO (sub-11, requisito 4).
 *
 * Un miembro de un salón NO puede leer los add-ons contratados (`salon_features`) ni
 * el branding privado (`salon_branding`) de OTRO salón. Ambas tablas cierran la
 * lectura con la MISMA ancla del esquema: `salon_id in (select app.user_salon_ids())`.
 *
 * Dos planos (mismo criterio que `customers-self-isolation.test.ts`):
 *
 *   A) COMPORTAMIENTO (modelo del predicado RLS): un cliente Supabase que EMULA la
 *      política —solo devuelve filas de `salon_features`/`salon_branding` cuyos
 *      `salon_id` estén en las membresías del usuario actual—. Sobre él se comprueba
 *      que un miembro del salón A, al preguntar por B, NO ve nada: `salonHasFeature`
 *      (el helper REAL) sobre el salón B devuelve `false` aunque B tenga el add-on, y
 *      una lectura del branding de B devuelve vacío. El control positivo (su propio
 *      salón sí es visible) evita que el aislamiento sea un falso positivo trivial.
 *
 *   B) FUENTE (contrato RLS en las migraciones): la garantía real vive en Postgres.
 *      Se verifica que `salon_features` y `salon_branding` tienen SELECT acotado por
 *      `app.user_salon_ids()`, que NINGUNA de las dos expone políticas a anon/public,
 *      que `salon_features` no concede ESCRITURA a `authenticated` (los entitlements
 *      los fija HAT3X) y que toda escritura de `salon_branding` está anclada en
 *      `app.has_salon_role` (owner/manager).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { salonHasFeature } from "@/lib/salon-features";
import type { SalonFeature } from "@/types/database";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const SALON_A = "salon-a";
const SALON_B = "salon-b";
const MEMBER_A = "member-a"; // miembro SOLO del salón A
const OUTSIDER = "outsider"; // no es miembro de ningún salón
const LOYALTY: SalonFeature = "loyalty";

// ─────────────────────────────────────────────────────────────────────────────
// A) Cliente Supabase que EMULA la política RLS de estas dos tablas: pre-filtra por
// `salon_id in (select app.user_salon_ids())` — las salas del usuario actual, según
// `salon_members`. Modela EXACTAMENTE el predicado que el plano B verifica en la
// migración. Las tablas no acotadas se leen sin filtro (no relevantes aquí).
// ─────────────────────────────────────────────────────────────────────────────
const RLS_GUARDED = new Set(["salon_features", "salon_branding"]);

function makeRlsClient(store: Store, userId: string | null) {
  const userSalonIds = (): Set<string> =>
    new Set(
      (store.salon_members ?? [])
        .filter((m) => m.user_id === userId)
        .map((m) => m.salon_id as string),
    );

  function builder(table: string) {
    const rows = (): Row[] => store[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    // La política de RLS se aplica ANTES que cualquier `.eq` del código.
    if (RLS_GUARDED.has(table)) {
      const visible = userSalonIds();
      filters.push((r) => visible.has(r.salon_id as string));
    }
    const b = {
      select: (_columns?: string) => b,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return b;
      },
      maybeSingle: () => {
        const match = rows().find((r) => filters.every((f) => f(r))) ?? null;
        return Promise.resolve({ data: match, error: null });
      },
      then: (onFulfilled: (v: { data: Row[]; error: null }) => unknown) =>
        onFulfilled({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }),
    };
    return b;
  }
  return { from: (table: string) => builder(table) };
}

type Client = Parameters<typeof salonHasFeature>[0];
const asClient = (store: Store, userId: string | null): Client =>
  makeRlsClient(store, userId) as unknown as Client;

/**
 * Lee el branding (privado) de un salón con el cliente RLS; null si no es visible.
 * Usa el cliente estructural directamente (no el cast a SupabaseClient): la tabla
 * `salon_branding` aún no está reflejada en `Database` (gap de tipos ya anotado en
 * la migración), así que `.from("salon_branding")` no encajaría en el tipo generado.
 */
async function readBranding(store: Store, userId: string | null, salonId: string) {
  const { data } = await makeRlsClient(store, userId)
    .from("salon_branding")
    .select("*")
    .eq("salon_id", salonId)
    .maybeSingle();
  return data;
}

function seed(): Store {
  return {
    salon_members: [
      { user_id: MEMBER_A, salon_id: SALON_A, role: "owner" },
      // MEMBER_A NO es miembro de B; OUTSIDER no es miembro de ninguno.
    ],
    // AMBOS salones tienen 'loyalty' activo y branding: el aislamiento no es porque
    // el dato de B no exista, sino porque a A se le OCULTA.
    salon_features: [
      { salon_id: SALON_A, feature: "loyalty", enabled: true },
      { salon_id: SALON_B, feature: "loyalty", enabled: true },
    ],
    salon_branding: [
      { salon_id: SALON_A, logo_url: "/a.png", primary_color: "#aa0000", secondary_color: null },
      { salon_id: SALON_B, logo_url: "/b.png", primary_color: "#0000bb", secondary_color: null },
    ],
  };
}

describe("aislamiento — un miembro no lee los features de otro salón", () => {
  it("MEMBER_A pregunta por el 'loyalty' de B ⇒ false (RLS oculta la fila de B)", async () => {
    const store = seed();
    // Aunque B tiene 'loyalty' activo, para A es como si no existiera.
    await expect(salonHasFeature(asClient(store, MEMBER_A), SALON_B, LOYALTY)).resolves.toBe(false);
  });

  it("control positivo: MEMBER_A SÍ ve el 'loyalty' de SU propio salón A ⇒ true", async () => {
    const store = seed();
    await expect(salonHasFeature(asClient(store, MEMBER_A), SALON_A, LOYALTY)).resolves.toBe(true);
  });

  it("un usuario sin membresía no ve los features de NINGÚN salón", async () => {
    const store = seed();
    await expect(salonHasFeature(asClient(store, OUTSIDER), SALON_A, LOYALTY)).resolves.toBe(false);
    await expect(salonHasFeature(asClient(store, OUTSIDER), SALON_B, LOYALTY)).resolves.toBe(false);
  });
});

describe("aislamiento — un miembro no lee el branding PRIVADO de otro salón", () => {
  it("MEMBER_A no ve el branding de B (lectura vacía)", async () => {
    const store = seed();
    await expect(readBranding(store, MEMBER_A, SALON_B)).resolves.toBeNull();
  });

  it("control positivo: MEMBER_A SÍ ve el branding de su propio salón A", async () => {
    const store = seed();
    const own = await readBranding(store, MEMBER_A, SALON_A);
    expect(own).toMatchObject({ salon_id: SALON_A, primary_color: "#aa0000" });
  });

  it("un usuario sin membresía no ve el branding de ningún salón", async () => {
    const store = seed();
    await expect(readBranding(store, OUTSIDER, SALON_A)).resolves.toBeNull();
    await expect(readBranding(store, OUTSIDER, SALON_B)).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) FUENTE — el contrato RLS real en las migraciones (defensa en profundidad).
// ─────────────────────────────────────────────────────────────────────────────
describe("contrato RLS en las migraciones (aislamiento por salón)", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const featuresSql = readFileSync(join(migrationsDir, "20260718100000_salon_features.sql"), "utf8");
  const brandingSql = readFileSync(join(migrationsDir, "20260718110000_salon_branding.sql"), "utf8");

  const policyStmts = (sql: string): string[] => sql.match(/create policy[\s\S]*?;/gi) ?? [];

  // Todas las `create policy … ;` del repo que apuntan a estas dos tablas: una
  // política abierta a anon/public introducida en CUALQUIER migración futura sería
  // detectable aquí, no solo en el archivo de origen.
  const allPolicyStmts = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => policyStmts(readFileSync(join(migrationsDir, f), "utf8")));
  const stmtsFor = (table: string) =>
    allPolicyStmts.filter((p) => new RegExp(`on public\\.${table}\\b`, "i").test(p));

  it("salon_features: SELECT acotado por app.user_salon_ids()", () => {
    expect(featuresSql).toMatch(
      /create policy "members_select_salon_features"\s*on public\.salon_features for select to authenticated\s*using \(salon_id in \(select app\.user_salon_ids\(\)\)\)/,
    );
  });

  it("salon_features: NINGUNA política de escritura para authenticated (los fija HAT3X)", () => {
    // La ÚNICA política de la tabla es de SELECT; no hay INSERT/UPDATE/DELETE/ALL.
    const stmts = stmtsFor("salon_features");
    expect(stmts.length).toBeGreaterThanOrEqual(1);
    const writePolicies = stmts.filter((p) => /for\s+(insert|update|delete|all)\b/i.test(p));
    expect(writePolicies).toEqual([]);
    // Y el guardián aborta si alguien añadiera una política de escritura.
    expect(featuresSql).toMatch(/política\(s\) de escritura/);
  });

  it("salon_branding: SELECT acotado por app.user_salon_ids()", () => {
    expect(brandingSql).toMatch(
      /create policy "members_select_salon_branding"\s*on public\.salon_branding for select to authenticated\s*using \(salon_id in \(select app\.user_salon_ids\(\)\)\)/,
    );
  });

  it("salon_branding: toda política de ESCRITURA exige app.has_salon_role (owner/manager)", () => {
    const writePolicies = stmtsFor("salon_branding").filter((p) =>
      /for\s+(insert|update|delete)\b/i.test(p),
    );
    expect(writePolicies.length).toBe(3); // insert + update + delete
    for (const p of writePolicies) {
      expect(p).toContain("has_salon_role");
    }
  });

  it("ni salon_features ni salon_branding exponen políticas a anon/public", () => {
    for (const table of ["salon_features", "salon_branding"]) {
      for (const p of stmtsFor(table)) {
        expect(p).toContain("to authenticated");
        expect(p).not.toMatch(/to\s+(anon|public)\b/i);
      }
    }
    // Ambos guardianes abortan además si una política quedara expuesta a anon/public.
    expect(featuresSql).toMatch(/anon\/public/);
    expect(brandingSql).toMatch(/anon\/public/);
  });
});
