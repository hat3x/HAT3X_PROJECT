/**
 * Autenticación + GATING de `/api/reception` — CONTRATO TRANSVERSAL (sub-11).
 *
 * La puerta de entrada de recepción la comparten TODOS sus endpoints a través de
 * `withReceptionGuard` (ver `@/lib/reception/guard`): antes de ejecutar lógica de
 * negocio, cada endpoint autentica la cabecera `x-api-key` → salón y comprueba el
 * add-on `ai_receptionist`. Este archivo prueba ese contrato END-TO-END, tal como lo
 * vive un endpoint real, y como PROPIEDAD TRANSVERSAL: un CATÁLOGO representativo de
 * endpoints (disponibilidad, alta/mover/cancelar/listar citas) se recorre en bucle y
 * TODOS deben responder igual ante los mismos estímulos. Un fallo aquí señala "una
 * ruta de recepción se saltó el guard común".
 *
 * Los cinco requisitos de la subtarea, verificados de punta a punta:
 *   1. Sin `x-api-key`               → 401 UNAUTHORIZED en todos los endpoints.
 *   2. Clave INACTIVA (revocada)     → 401 (el filtro `is_active = true` no la halla).
 *   3. Clave VÁLIDA                  → resuelve el SALÓN CORRECTO (aislamiento cross-tenant:
 *                                      la clave del salón A jamás resuelve el salón B).
 *   4. `ai_receptionist` DESACTIVADO → 403 FEATURE_NOT_ENABLED en todos los endpoints
 *                                      (ambas formas del gate cerrado: fila ausente y `enabled=false`).
 *   5. `ai_receptionist` ACTIVO      → los endpoints funcionan (control positivo por endpoint).
 *
 * ── Por qué INTEGRACIÓN y no solo el guard aislado ───────────────────────────
 * A diferencia de `reception-guard.test.ts` (que INYECTA un admin falso vía `deps`),
 * aquí NO se inyecta nada: `withReceptionGuard(handler)` llama al `createAdminClient()`
 * REAL, que está MOCKEADO por un doble CON ESTADO (BD en memoria que aplica filtros y
 * persiste el sello). Así se ejercita el CABLEADO completo: hash real de la clave →
 * fila real de `service_api_keys` → fila real de `salon_features`. Es el mismo doble
 * con estado del resto de la suite (`salon-features-gate.test.ts`), y las claves se
 * generan con el NÚCLEO REAL (`generateServiceKey`/`hashServiceKey`), de modo que se
 * almacena SOLO su hash, exactamente como en la emisión de producción.
 *
 * ── Se activa el add-on SOLO en el escenario de prueba (NO en producción) ────
 * REQUISITO EXPLÍCITO de la subtarea: activar `ai_receptionist` únicamente en el
 * escenario del test, jamás en el salón de producción `denueveanueve`. Aquí se cumple
 * POR CONSTRUCCIÓN y se verifica como propiedad ejecutable (ver el bloque final):
 *   · todo el flujo corre contra un `createAdminClient()` MOCKEADO — nunca una BD real,
 *     ni credenciales, ni red: producción queda intacta; y
 *   · los entitlements sembrados pertenecen SOLO a salones sintéticos del test
 *     (`salon-recepcion`, `salon-vecino`); `denueveanueve` NO aparece en ninguno.
 *
 * ── Alcance de "todos los endpoints" ─────────────────────────────────────────
 * Al escribir esta subtarea aún no existen ficheros `route.ts` bajo
 * `src/app/api/reception/`; el contrato lo GARANTIZA la envoltura común
 * `withReceptionGuard`. El catálogo de abajo modela las formas de endpoint previstas y
 * las prueba contra ESA envoltura, así que cualquier ruta futura construida sobre ella
 * hereda estas garantías. Cuando aterricen los `route.ts` reales, añádelos al catálogo.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

type Row = Record<string, unknown>;

// -----------------------------------------------------------------------------
// Doble CON ESTADO del cliente admin (service_role). BD en memoria que enruta las
// DOS tablas del flujo del guard: `service_api_keys` (lectura de la clave + sello
// `last_used_at`) y `salon_features` (lectura del entitlement). Aplica filtros `.eq`,
// persiste el `update` y CUENTA las lecturas para poder afirmar el orden authz-tras-authn.
// -----------------------------------------------------------------------------
const holder = vi.hoisted(() => ({
  store: new Map<string, Row[]>(),
  authReads: 0, // nº de lecturas de `service_api_keys` (autenticación)
  featureReads: 0, // nº de lecturas de `salon_features` (entitlement)
}));

function rowsOf(table: string): Row[] {
  if (!holder.store.has(table)) holder.store.set(table, []);
  return holder.store.get(table) as Row[];
}

/** Builder fiel (parcial) del query builder de Supabase sobre la BD en memoria. */
function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let pendingUpdate: Row | null = null;

  const apply = (list: Row[]): Row[] => list.filter((r) => filters.every((f) => f(r)));

  function runWrite(): Row[] {
    if (pendingUpdate === null) return apply(rowsOf(table));
    const targets = apply(rowsOf(table));
    for (const r of targets) Object.assign(r, pendingUpdate);
    return targets;
  }

  const resolveList = (): { data: Row[]; error: null } => ({
    data: pendingUpdate !== null ? runWrite() : apply(rowsOf(table)),
    error: null,
  });

  const resolveSingle = (): { data: Row | null; error: null } => {
    if (table === "service_api_keys") holder.authReads += 1;
    if (table === "salon_features") holder.featureReads += 1;
    return { data: resolveList().data[0] ?? null, error: null };
  };

  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return b;
    },
    update: (payload: Row) => {
      pendingUpdate = payload;
      return b;
    },
    maybeSingle: () => Promise.resolve(resolveSingle()),
    // El sello `last_used_at` se hace `await admin.from().update().eq()`: el builder es
    // "thenable" y aplica la escritura al resolverse (best-effort; el guard lo ignora).
    then: (onFulfilled: (v: { data: Row[]; error: null }) => unknown) =>
      onFulfilled(resolveList()),
  };
  return b;
}

function makeClient() {
  return { from: (table: string) => makeBuilder(table) };
}

// El guard usa el `createAdminClient()` REAL (no inyectamos `deps`): lo mockeamos para
// que devuelva el doble con estado. Si tocara la BD real exigiría envs/credenciales.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

import { withReceptionGuard } from "@/lib/reception/guard";
import {
  receptionJson,
  receptionCreated,
  receptionNoContent,
} from "@/lib/reception/http";
import { receptionErrorMessage } from "@/lib/reception/errors";
import { generateServiceKey, hashServiceKey } from "@/lib/service-keys/keys";
import { SERVICE_API_KEY_HEADER } from "@/lib/service-keys/verify";
import { createAdminClient } from "@/lib/supabase/admin";

// -----------------------------------------------------------------------------
// Escenario: DOS salones sintéticos, cada uno con SU add-on activo y SU clave. El
// tercer registro es una clave REVOCADA del primer salón. Nada de producción.
// -----------------------------------------------------------------------------
const SALON_RECEP = "salon-recepcion"; // salón principal del escenario
const SALON_OTHER = "salon-vecino"; // otro salón (para probar el aislamiento cross-tenant)
const PROD_SALON = "denueveanueve"; // salón REAL de producción: JAMÁS debe activarse aquí

/** Proveedor de bytes DETERMINISTA (reproduce claves estables en el test). */
function fixedBytes(seed: number): (n: number) => Uint8Array {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (seed + i) % 256;
    return out;
  };
}

// Claves generadas con el núcleo REAL: solo su HASH se persiste (como en producción).
const KEY_RECEP = generateServiceKey(fixedBytes(101)); // válida, activa → SALON_RECEP
const KEY_OTHER = generateServiceKey(fixedBytes(202)); // válida, activa → SALON_OTHER
const KEY_REVOKED = generateServiceKey(fixedBytes(303)); // presente pero is_active=false → SALON_RECEP

/** Siembra el escenario limpio. El add-on `ai_receptionist` se activa AQUÍ, y solo aquí. */
function seed(): void {
  holder.store = new Map<string, Row[]>();
  holder.authReads = 0;
  holder.featureReads = 0;

  holder.store.set("service_api_keys", [
    {
      id: "key-recep",
      salon_id: SALON_RECEP,
      key_hash: KEY_RECEP.keyHash,
      key_prefix: KEY_RECEP.keyPrefix,
      scopes: ["reservas:write"],
      is_active: true,
    },
    {
      id: "key-other",
      salon_id: SALON_OTHER,
      key_hash: KEY_OTHER.keyHash,
      key_prefix: KEY_OTHER.keyPrefix,
      scopes: ["reservas:write"],
      is_active: true,
    },
    {
      id: "key-revoked",
      salon_id: SALON_RECEP,
      key_hash: KEY_REVOKED.keyHash,
      key_prefix: KEY_REVOKED.keyPrefix,
      scopes: ["reservas:write"],
      is_active: false, // ← clave revocada: existe la fila, pero NO está activa
    },
  ]);

  // Add-on de recepción ACTIVO por defecto para los DOS salones sintéticos del test.
  // Los controles positivos parten de aquí; los tests de gate lo retiran con `disableFeature`.
  holder.store.set("salon_features", [
    { salon_id: SALON_RECEP, feature: "ai_receptionist", enabled: true },
    { salon_id: SALON_OTHER, feature: "ai_receptionist", enabled: true },
  ]);
}

/** Retira el add-on del salón, en las DOS formas que el gate trata igual (cerrado). */
function disableFeature(salonId: string, mode: "absent" | "disabled"): void {
  const rows = rowsOf("salon_features");
  if (mode === "absent") {
    holder.store.set(
      "salon_features",
      rows.filter((r) => r.salon_id !== salonId),
    );
  } else {
    for (const r of rows) if (r.salon_id === salonId) r.enabled = false;
  }
}

// -----------------------------------------------------------------------------
// CATÁLOGO de endpoints — cada uno es un handler REAL envuelto por `withReceptionGuard`
// (misma envoltura que usarán los `route.ts` de producción). Al superar el guard, el
// handler ANOTA en `sink` que se ejecutó y CON qué salón, y devuelve su respuesta de
// éxito. Así el bucle transversal comprueba, con un mismo aserto, cada forma de endpoint.
// -----------------------------------------------------------------------------
interface Sink {
  ran: boolean;
  salon: string | null;
  scopes: readonly string[] | null;
}

interface Endpoint {
  name: string;
  /** Estado HTTP del éxito (200 lectura/mover, 201 alta, 204 cancelar). */
  okStatus: number;
  /** Construye el handler guardado, cableado a `sink`. */
  build: (sink: Sink) => (request: NextRequest, context: unknown) => Promise<NextResponse>;
  /** Contexto de ruta de Next (`{ params }` en rutas dinámicas). */
  routeContext: unknown;
}

function record(
  sink: Sink,
  guard: { salonId: string; identity: { scopes: readonly string[] } },
): void {
  sink.ran = true;
  sink.salon = guard.salonId;
  sink.scopes = guard.identity.scopes;
}

const CATALOG: Endpoint[] = [
  {
    name: "GET /api/reception/availability",
    okStatus: 200,
    routeContext: undefined,
    build: (sink) =>
      withReceptionGuard((_req, guard) => {
        record(sink, guard);
        return receptionJson({ slots: [], salon: guard.salonId });
      }),
  },
  {
    name: "POST /api/reception/appointments",
    okStatus: 201,
    routeContext: undefined,
    build: (sink) =>
      withReceptionGuard((_req, guard) => {
        record(sink, guard);
        return receptionCreated({ id: "apt_new", salon: guard.salonId });
      }),
  },
  {
    name: "GET /api/reception/appointments",
    okStatus: 200,
    routeContext: undefined,
    build: (sink) =>
      withReceptionGuard((_req, guard) => {
        record(sink, guard);
        return receptionJson({ appointments: [], salon: guard.salonId });
      }),
  },
  {
    name: "PATCH /api/reception/appointments/:id",
    okStatus: 200,
    routeContext: { params: { id: "apt_7" } },
    build: (sink) =>
      withReceptionGuard((_req, guard, ctx) => {
        record(sink, guard);
        // Ruta dinámica: el contexto de Next trae `{ params }`. El catálogo tipa el
        // contexto como `unknown` (uniforme entre endpoints), así que se acota aquí.
        const { params } = ctx as { params: { id: string } };
        return receptionJson({ id: params.id, salon: guard.salonId, moved: true });
      }),
  },
  {
    name: "DELETE /api/reception/appointments/:id",
    okStatus: 204,
    routeContext: { params: { id: "apt_7" } },
    build: (sink) =>
      withReceptionGuard((_req, guard) => {
        record(sink, guard);
        return receptionNoContent();
      }),
  },
];

// -----------------------------------------------------------------------------
// Utilidades de petición
// -----------------------------------------------------------------------------

/** Unos `Headers` con la cabecera `x-api-key` (o sin ella si `key` es null). */
function headersWithKey(key: string | null): Headers {
  const h = new Headers();
  if (key !== null) h.set(SERVICE_API_KEY_HEADER, key);
  return h;
}

/** Petición mínima: el guard solo lee `request.headers`. */
function fakeRequest(headers: Headers): NextRequest {
  return { headers } as unknown as NextRequest;
}

/** Invoca un endpoint del catálogo con una clave dada; devuelve la respuesta y el sink. */
async function call(
  endpoint: Endpoint,
  key: string | null,
): Promise<{ res: NextResponse; sink: Sink }> {
  const sink: Sink = { ran: false, salon: null, scopes: null };
  const handler = endpoint.build(sink);
  const res = await handler(fakeRequest(headersWithKey(key)), endpoint.routeContext);
  return { res, sink };
}

beforeEach(() => {
  seed();
});

// ─────────────────────────────────────────────────────────────────────────────
// Requisito 1 — SIN clave → 401 UNAUTHORIZED en TODOS los endpoints (FAIL-CLOSED).
// ─────────────────────────────────────────────────────────────────────────────
describe("sin x-api-key — 401 en todos los endpoints y el handler NO se ejecuta", () => {
  for (const endpoint of CATALOG) {
    it(`${endpoint.name} → 401 UNAUTHORIZED`, async () => {
      const { res, sink } = await call(endpoint, null);

      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
      await expect(res.json()).resolves.toEqual({
        error: { code: "UNAUTHORIZED", message: receptionErrorMessage("UNAUTHORIZED") },
      });
      // El handler quedó cortado y NADA se consultó: ni la clave (sin cabecera, filtro
      // barato) ni el add-on. El extraño no puede inferir si el salón tiene recepción IA.
      expect(sink.ran).toBe(false);
      expect(holder.authReads).toBe(0);
      expect(holder.featureReads).toBe(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Requisito 2 — clave INACTIVA (revocada) → 401 en TODOS los endpoints.
// La fila EXISTE pero `is_active=false`; el filtro `is_active = true` no la halla.
// ─────────────────────────────────────────────────────────────────────────────
describe("clave inactiva (revocada) — 401 en todos los endpoints", () => {
  for (const endpoint of CATALOG) {
    it(`${endpoint.name} → 401 UNAUTHORIZED (fila presente pero is_active=false)`, async () => {
      const { res, sink } = await call(endpoint, KEY_REVOKED.key);

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
      expect(sink.ran).toBe(false);
      // SÍ se consultó `service_api_keys` (la clave tenía formato válido), a diferencia
      // del caso sin cabecera; pero al no autenticar, el add-on NUNCA se probó.
      expect(holder.authReads).toBe(1);
      expect(holder.featureReads).toBe(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Requisito 3 — clave VÁLIDA → resuelve el SALÓN CORRECTO (aislamiento cross-tenant).
// ─────────────────────────────────────────────────────────────────────────────
describe("clave válida — resuelve el salón correcto en cada endpoint", () => {
  const cases = [
    { label: "clave del salón principal", key: KEY_RECEP.key, salon: SALON_RECEP, other: SALON_OTHER },
    { label: "clave del salón vecino", key: KEY_OTHER.key, salon: SALON_OTHER, other: SALON_RECEP },
  ];

  for (const c of cases) {
    for (const endpoint of CATALOG) {
      it(`${endpoint.name} con ${c.label} → resuelve ${c.salon}`, async () => {
        const { res, sink } = await call(endpoint, c.key);

        expect(res.status).toBe(endpoint.okStatus);
        expect(sink.ran).toBe(true);
        // El handler recibió EXACTAMENTE el salón de la clave, nunca el del vecino.
        expect(sink.salon).toBe(c.salon);
        expect(sink.salon).not.toBe(c.other);
        expect(sink.scopes).toEqual(["reservas:write"]);
      });
    }
  }

  it("el salón resuelto viaja al cuerpo de éxito (no solo al handler)", async () => {
    const { res } = await call(CATALOG[0]!, KEY_RECEP.key); // GET availability → 200 con { salon }
    await expect(res.json()).resolves.toMatchObject({ salon: SALON_RECEP });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Requisito 4 — `ai_receptionist` DESACTIVADO → 403 FEATURE_NOT_ENABLED en TODOS los
// endpoints, en las DOS formas del gate cerrado (fila ausente y `enabled=false`).
// ─────────────────────────────────────────────────────────────────────────────
describe("add-on desactivado — 403 FEATURE_NOT_ENABLED en todos los endpoints", () => {
  for (const mode of ["absent", "disabled"] as const) {
    for (const endpoint of CATALOG) {
      it(`${endpoint.name} → 403 (add-on ${mode})`, async () => {
        disableFeature(SALON_RECEP, mode);
        const { res, sink } = await call(endpoint, KEY_RECEP.key);

        expect(res.status).toBe(403);
        await expect(res.json()).resolves.toMatchObject({
          error: { code: "FEATURE_NOT_ENABLED" },
        });
        // Autenticó primero (authz-tras-authn) y luego el gate cortó ANTES del handler.
        expect(sink.ran).toBe(false);
        expect(holder.authReads).toBe(1);
        expect(holder.featureReads).toBe(1);
      });
    }
  }

  it("desactivar el salón vecino NO afecta al principal (el gate es por salón)", async () => {
    disableFeature(SALON_OTHER, "absent");
    const { res, sink } = await call(CATALOG[0]!, KEY_RECEP.key);
    expect(res.status).toBe(200);
    expect(sink.salon).toBe(SALON_RECEP);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Requisito 5 — `ai_receptionist` ACTIVO → los endpoints funcionan (control positivo).
// ─────────────────────────────────────────────────────────────────────────────
describe("add-on activo — todos los endpoints operan con normalidad", () => {
  for (const endpoint of CATALOG) {
    it(`${endpoint.name} → ${endpoint.okStatus} y el handler se ejecuta`, async () => {
      const { res, sink } = await call(endpoint, KEY_RECEP.key);

      expect(res.status).toBe(endpoint.okStatus);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(sink.ran).toBe(true);
      expect(sink.salon).toBe(SALON_RECEP);
      // Autenticó (1) y comprobó el entitlement (1): el camino feliz completo.
      expect(holder.authReads).toBe(1);
      expect(holder.featureReads).toBe(1);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// El add-on se activa SOLO en el escenario del test — producción (`denueveanueve`)
// queda INTACTA. Requisito explícito, verificado como propiedad ejecutable.
// ─────────────────────────────────────────────────────────────────────────────
describe("aislamiento de producción — el add-on se activa solo en el escenario", () => {
  it("ningún salón de producción (denueveanueve) aparece en los entitlements sembrados", () => {
    const withFeature = rowsOf("salon_features").map((r) => r.salon_id);
    expect(withFeature).not.toContain(PROD_SALON);
    // SOLO los salones sintéticos del test tienen `ai_receptionist` activo.
    expect(new Set(withFeature)).toEqual(new Set([SALON_RECEP, SALON_OTHER]));
  });

  it("todo el flujo corre contra un admin client MOCKEADO (nunca la BD real)", () => {
    // El `createAdminClient` real LANZA sin envs de Supabase; el mock NO. Que no lance y
    // exponga `.from` prueba que el doble está en su sitio: no hay red, credenciales ni
    // datos de producción implicados en esta suite.
    expect(() => createAdminClient()).not.toThrow();
    expect(typeof createAdminClient().from).toBe("function");
  });

  it("las claves se persisten SOLO por su hash (nunca en claro), como en producción", () => {
    const stored = rowsOf("service_api_keys");
    for (const row of stored) {
      expect(row.key_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex minúsculas
      // La clave en claro no está en ninguna columna almacenada.
      expect(Object.values(row)).not.toContain(KEY_RECEP.key);
    }
    // El hash almacenado del salón principal casa con el hash real de su clave en claro.
    const recepRow = stored.find((r) => r.id === "key-recep");
    expect(recepRow?.key_hash).toBe(hashServiceKey(KEY_RECEP.key));
  });
});
