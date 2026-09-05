/**
 * GUARD de los Route Handlers de `/api/reception` (`@/lib/reception/guard`).
 *
 * Cubre la puerta de entrada COMÚN de recepción: authn por `x-api-key` + gate del
 * add-on `ai_receptionist`, en ese orden. Los contratos de seguridad que se prueban:
 *
 *   · FAIL-CLOSED al autenticar: sin clave / clave ajena / desconocida / revocada
 *     ⇒ `401 UNAUTHORIZED` y el entitlement NUNCA se consulta (no se filtra a un
 *     extraño si el salón tiene o no la recepción IA). El ORDEN es authz-tras-authn.
 *   · El entitlement se comprueba SIEMPRE contra el salón AUTENTICADO (el de la
 *     clave), acotando `salon_features` por ese `salon_id` (aislamiento cross-tenant).
 *   · Salón sin `ai_receptionist` activo ⇒ `403 FEATURE_NOT_ENABLED`.
 *   · Fallo al leer el catálogo ⇒ `500 INTERNAL_ERROR` (FAIL-CLOSED) SIN filtrar la
 *     causa interna al cliente.
 *   · `withReceptionGuard`: si el guard falla, el handler NO se ejecuta y sale el
 *     contrato con su status; si el handler lanza, se traduce igual (ReceptionError →
 *     su status; cualquier otra cosa → 500 sin fuga). El `salonId`/`identity`
 *     resueltos llegan al handler junto con el contexto de ruta de Next.
 *
 * Se inyecta un cliente admin FALSO (nunca toca la BD real) que enruta las DOS tablas
 * del flujo: `service_api_keys` (lectura de la clave + sello) y `salon_features`
 * (lectura del entitlement). La clave se genera con el núcleo real para que tenga el
 * formato `sk_recep_<43 base62>` y su hash case con lo que el guard consulta.
 */
import { describe, it, expect } from "vitest";

import {
  RECEPTION_FEATURE,
  resolveReceptionContext,
  withReceptionGuard,
  type ReceptionGuardDeps,
} from "@/lib/reception/guard";
import { ReceptionError, receptionErrorMessage } from "@/lib/reception/errors";
import { receptionJson } from "@/lib/reception/http";
import { generateServiceKey, hashServiceKey } from "@/lib/service-keys/keys";
import { SERVICE_API_KEY_HEADER } from "@/lib/service-keys/verify";
import type { NextRequest } from "next/server";

// -----------------------------------------------------------------------------
// Cliente admin FALSO — enruta service_api_keys (auth + sello) y salon_features.
// -----------------------------------------------------------------------------

type Admin = NonNullable<ReceptionGuardDeps["admin"]>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

/** Una lectura capturada: columnas proyectadas y filtros aplicados. */
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
}

interface FakeGuardConfig {
  /** Resultado de la búsqueda por (key_hash, is_active) en `service_api_keys`. */
  auth: QueryResult;
  /** Resultado del gate en `salon_features` (por defecto: sin fila ⇒ no activo). */
  feature?: QueryResult;
  /** Si es true, la lectura de `salon_features` LANZA (simula fallo de red/DB). */
  featureThrows?: boolean;
  /** Resultado del sello `last_used_at` (por defecto, éxito silencioso). */
  update?: QueryResult;
}

/**
 * Cliente admin falso. Cada `from(table)` devuelve un builder encadenable
 * (`.select().eq()…maybeSingle()` y `.update().eq()`), capturando cada interacción
 * por tabla para poder auditar columnas, filtros y ORDEN.
 */
function fakeGuardAdmin(config: FakeGuardConfig): {
  admin: Admin;
  authSelects: SelectCall[];
  featureSelects: SelectCall[];
  updates: { payload: Record<string, unknown>; filters: Record<string, unknown> }[];
} {
  const authSelects: SelectCall[] = [];
  const featureSelects: SelectCall[] = [];
  const updates: { payload: Record<string, unknown>; filters: Record<string, unknown> }[] = [];

  const client = {
    from(table: string) {
      if (table === "service_api_keys") {
        let columns = "";
        const filters: Record<string, unknown> = {};
        const builder = {
          select(cols: string) {
            columns = cols;
            return builder;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return builder;
          },
          maybeSingle() {
            authSelects.push({ columns, filters: { ...filters } });
            return Promise.resolve(config.auth);
          },
          update(payload: Record<string, unknown>) {
            const uf: Record<string, unknown> = {};
            return {
              eq(col: string, val: unknown) {
                uf[col] = val;
                updates.push({ payload, filters: { ...uf } });
                return Promise.resolve(config.update ?? { data: null, error: null });
              },
            };
          },
        };
        return builder;
      }
      if (table === "salon_features") {
        let columns = "";
        const filters: Record<string, unknown> = {};
        const builder = {
          select(cols: string) {
            columns = cols;
            return builder;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return builder;
          },
          maybeSingle() {
            featureSelects.push({ columns, filters: { ...filters } });
            if (config.featureThrows === true) {
              return Promise.reject(new Error("fallo al leer salon_features"));
            }
            return Promise.resolve(config.feature ?? { data: null, error: null });
          },
        };
        return builder;
      }
      throw new Error(`fakeGuardAdmin: tabla inesperada '${table}'`);
    },
  };

  return { admin: client as unknown as Admin, authSelects, featureSelects, updates };
}

/** Construye unos `Headers` con la cabecera x-api-key (o sin ella si key es null). */
function headersWithKey(key: string | null): Headers {
  const h = new Headers();
  if (key !== null) h.set(SERVICE_API_KEY_HEADER, key);
  return h;
}

/** Petición mínima: el guard solo lee `request.headers`. */
function fakeRequest(headers: Headers): NextRequest {
  return { headers } as unknown as NextRequest;
}

const NOW_ISO = "2026-07-23T10:00:00.000Z";

/** Fila NO secreta de una clave válida y activa (la que devolvería la BD). */
function authRow(over: Partial<Record<string, unknown>> = {}): QueryResult {
  return {
    data: {
      id: "key-1",
      salon_id: "salon-9",
      scopes: ["reservas:write"],
      key_prefix: "sk_recep_abcdef",
      ...over,
    },
    error: null,
  };
}

/** El salón tiene el add-on contratado y activo (fila con enabled=true). */
const FEATURE_ON: QueryResult = { data: { enabled: true }, error: null };
/** El salón NO tiene el add-on (sin fila). */
const FEATURE_OFF: QueryResult = { data: null, error: null };

/** Una clave con formato válido (`sk_recep_<43 base62>`) generada con el núcleo real. */
function validKey(seed: number): string {
  const bytes = (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (seed + i) % 256;
    return out;
  };
  return generateServiceKey(bytes).key;
}

// -----------------------------------------------------------------------------
// RECEPTION_FEATURE — el add-on exigido está fijado y tipado
// -----------------------------------------------------------------------------

describe("RECEPTION_FEATURE", () => {
  it("es exactamente 'ai_receptionist' (el add-on de la recepción IA)", () => {
    expect(RECEPTION_FEATURE).toBe("ai_receptionist");
  });
});

// -----------------------------------------------------------------------------
// resolveReceptionContext — authn + entitlement
// -----------------------------------------------------------------------------

describe("resolveReceptionContext — camino feliz", () => {
  it("resuelve { salonId, identity } cuando la clave es válida y el add-on está activo", async () => {
    const key = validKey(11);
    const { admin, authSelects, featureSelects } = fakeGuardAdmin({
      auth: authRow({ id: "key-7", salon_id: "salon-9", scopes: ["reservas:write"] }),
      feature: FEATURE_ON,
    });

    const ctx = await resolveReceptionContext(headersWithKey(key), { admin, now: () => NOW_ISO });

    expect(ctx.salonId).toBe("salon-9");
    expect(ctx.identity).toEqual({
      keyId: "key-7",
      salonId: "salon-9",
      scopes: ["reservas:write"],
      keyPrefix: "sk_recep_abcdef",
    });

    // Autenticó buscando por el hash de la clave entrante y SOLO filas activas.
    expect(authSelects).toHaveLength(1);
    expect(authSelects[0]!.filters).toEqual({ key_hash: hashServiceKey(key), is_active: true });

    // El entitlement se comprobó UNA vez, acotado al salón AUTENTICADO y al add-on.
    expect(featureSelects).toHaveLength(1);
    expect(featureSelects[0]!.filters).toMatchObject({
      salon_id: "salon-9",
      feature: "ai_receptionist",
      enabled: true,
    });
  });
});

describe("resolveReceptionContext — 401 UNAUTHORIZED (FAIL-CLOSED, sin probar el add-on)", () => {
  it("sin cabecera x-api-key → 401 y NO consulta salon_features", async () => {
    const { admin, authSelects, featureSelects } = fakeGuardAdmin({ auth: FEATURE_OFF });
    await expect(
      resolveReceptionContext(headersWithKey(null), { admin }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    // Ni siquiera se hasheó/consultó la clave (filtro barato) ni se probó el add-on.
    expect(authSelects).toHaveLength(0);
    expect(featureSelects).toHaveLength(0);
  });

  it("clave con formato ajeno → 401 sin tocar ninguna tabla", async () => {
    const { admin, authSelects, featureSelects } = fakeGuardAdmin({ auth: FEATURE_OFF });
    await expect(
      resolveReceptionContext(headersWithKey("no-es-una-clave"), { admin }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(authSelects).toHaveLength(0);
    expect(featureSelects).toHaveLength(0);
  });

  it("clave desconocida/revocada (sin fila) → 401 y el add-on NO se consulta", async () => {
    const key = validKey(12);
    const { admin, authSelects, featureSelects } = fakeGuardAdmin({
      auth: { data: null, error: null },
      feature: FEATURE_ON, // aunque el add-on estuviera activo, no debe llegarse a mirarlo
    });
    await expect(
      resolveReceptionContext(headersWithKey(key), { admin }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(authSelects).toHaveLength(1); // sí consultó (la clave tenía formato válido)…
    expect(featureSelects).toHaveLength(0); // …pero al no autenticar, no probó el entitlement.
  });

  it("error de lectura de la clave → 401 (FAIL-CLOSED) y sin consultar el add-on", async () => {
    const key = validKey(13);
    const { admin, featureSelects } = fakeGuardAdmin({
      auth: { data: null, error: { message: "boom" } },
    });
    await expect(
      resolveReceptionContext(headersWithKey(key), { admin }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
    expect(featureSelects).toHaveLength(0);
  });
});

describe("resolveReceptionContext — 403 FEATURE_NOT_ENABLED", () => {
  it("clave válida pero el salón NO tiene 'ai_receptionist' activo → 403", async () => {
    const key = validKey(14);
    const { admin, authSelects, featureSelects } = fakeGuardAdmin({
      auth: authRow({ salon_id: "salon-9" }),
      feature: FEATURE_OFF,
    });
    await expect(
      resolveReceptionContext(headersWithKey(key), { admin }),
    ).rejects.toMatchObject({ code: "FEATURE_NOT_ENABLED", status: 403 });
    // Autenticó primero (authz-tras-authn) y luego probó el add-on del salón correcto.
    expect(authSelects).toHaveLength(1);
    expect(featureSelects).toHaveLength(1);
    expect(featureSelects[0]!.filters).toMatchObject({ salon_id: "salon-9", feature: "ai_receptionist" });
  });
});

describe("resolveReceptionContext — 500 INTERNAL_ERROR (fallo al leer el catálogo, FAIL-CLOSED)", () => {
  it("si salon_features LANZA, se colapsa a internal 500 sin conceder acceso", async () => {
    const key = validKey(15);
    const { admin } = fakeGuardAdmin({ auth: authRow(), featureThrows: true });
    await expect(
      resolveReceptionContext(headersWithKey(key), { admin }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });

  it("si salon_features DEVUELVE error, también sale internal 500 y NO se filtra la causa", async () => {
    const key = validKey(16);
    const { admin } = fakeGuardAdmin({
      auth: authRow(),
      feature: { data: null, error: { message: "postgres: 42P01 salon_features" } },
    });
    let caught: unknown;
    try {
      await resolveReceptionContext(headersWithKey(key), { admin });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReceptionError);
    expect(caught).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    // El mensaje del contrato NO expone el detalle interno de Postgres.
    expect((caught as ReceptionError).message).not.toContain("42P01");
  });
});

// -----------------------------------------------------------------------------
// withReceptionGuard — envoltura de Route Handlers
// -----------------------------------------------------------------------------

describe("withReceptionGuard — ejecuta el handler solo tras superar el guard", () => {
  it("pasa { salonId, identity } y el contexto de ruta al handler y devuelve su respuesta", async () => {
    const key = validKey(21);
    const { admin } = fakeGuardAdmin({
      auth: authRow({ salon_id: "salon-9" }),
      feature: FEATURE_ON,
    });

    let seen: { salonId: string; scopes: readonly string[]; params: unknown } | null = null;
    const handler = withReceptionGuard<{ params: { id: string } }>(
      (_request, guard, context) => {
        seen = { salonId: guard.salonId, scopes: guard.identity.scopes, params: context.params };
        return receptionJson({ ok: true, salon: guard.salonId });
      },
      { admin, now: () => NOW_ISO },
    );

    const res = await handler(fakeRequest(headersWithKey(key)), { params: { id: "apt_7" } });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, salon: "salon-9" });
    expect(seen).toEqual({
      salonId: "salon-9",
      scopes: ["reservas:write"],
      params: { id: "apt_7" },
    });
  });

  it("sin clave → 401 del contrato y el handler NO se ejecuta", async () => {
    const { admin } = fakeGuardAdmin({ auth: FEATURE_OFF });
    let called = false;
    const handler = withReceptionGuard(() => {
      called = true;
      return receptionJson({ ok: true });
    }, { admin });

    const res = await handler(fakeRequest(headersWithKey(null)), undefined);

    expect(called).toBe(false);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: receptionErrorMessage("UNAUTHORIZED") },
    });
  });

  it("salón sin el add-on → 403 FEATURE_NOT_ENABLED y el handler NO se ejecuta", async () => {
    const key = validKey(22);
    const { admin } = fakeGuardAdmin({ auth: authRow(), feature: FEATURE_OFF });
    let called = false;
    const handler = withReceptionGuard(() => {
      called = true;
      return receptionJson({ ok: true });
    }, { admin });

    const res = await handler(fakeRequest(headersWithKey(key)), undefined);

    expect(called).toBe(false);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "FEATURE_NOT_ENABLED" } });
  });
});

describe("withReceptionGuard — traduce lo que lance el handler (red de seguridad)", () => {
  it("un ReceptionError del handler conserva su status (p. ej. SLOT_TAKEN → 409)", async () => {
    const key = validKey(23);
    const { admin } = fakeGuardAdmin({ auth: authRow(), feature: FEATURE_ON });
    const handler = withReceptionGuard(() => {
      throw ReceptionError.slotTaken();
    }, { admin });

    const res = await handler(fakeRequest(headersWithKey(key)), undefined);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "SLOT_TAKEN" } });
  });

  it("un Error inesperado del handler → 500 INTERNAL_ERROR sin filtrar el detalle", async () => {
    const key = validKey(24);
    const { admin } = fakeGuardAdmin({ auth: authRow(), feature: FEATURE_ON });
    const handler = withReceptionGuard(() => {
      throw new Error("postgres: relation appointments 42P01");
    }, { admin });

    const res = await handler(fakeRequest(headersWithKey(key)), undefined);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("42P01");
  });
});
