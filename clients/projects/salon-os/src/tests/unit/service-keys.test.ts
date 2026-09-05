/**
 * Tests de las claves de servicio (`@/lib/service-keys`).
 *
 * Cubre las dos garantías de seguridad de la emisión:
 *   1. GENERACIÓN (núcleo puro): la clave tiene el formato `sk_recep_<43 base62>`,
 *      respaldada por 256 bits; su hash es SHA-256 hex minúsculas (64) que casa
 *      con el CHECK `^[a-f0-9]{64}$` de la tabla; y el prefijo NO secreto cabe en
 *      el CHECK `char_length(key_prefix) between 3 and 24`.
 *   2. EMISIÓN (con cliente admin falso): se persiste SOLO `(salon_id, name,
 *      key_hash, key_prefix, scopes)` —NUNCA la clave en claro— y la clave se
 *      devuelve UNA sola vez. Se cubren validación, salón inexistente y la carrera
 *      del `key_hash` UNIQUE (23505).
 */
import { createHash } from "node:crypto";

import { describe, it, expect } from "vitest";

import {
  generateServiceKey,
  hashServiceKey,
  isValidServiceKeyFormat,
  serviceKeyPrefix,
  SERVICE_KEY_FORMAT,
  SERVICE_KEY_PREFIX_LENGTH,
  SERVICE_KEY_RANDOM_BYTES,
  SERVICE_KEY_SCHEME,
  SERVICE_KEY_TOKEN_LENGTH,
} from "@/lib/service-keys/keys";
import {
  issueServiceApiKey,
  ServiceKeyError,
  type IssueServiceApiKeyDeps,
} from "@/lib/service-keys/issue";
import {
  authenticateServiceApiKey,
  readServiceApiKeyHeader,
  requireServiceApiKey,
  SERVICE_API_KEY_HEADER,
  type AuthenticateServiceApiKeyDeps,
} from "@/lib/service-keys/verify";
import { ReceptionError } from "@/lib/reception/errors";

// Formato que EXIGE la tabla al key_hash (CHECK ^[a-f0-9]{64}$).
const SHA256_HEX_LOWER = /^[a-f0-9]{64}$/;

/** Proveedor de bytes DETERMINISTA (no aleatorio) para reproducir claves en tests. */
function fixedBytes(seed: number): (n: number) => Uint8Array {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (seed + i) % 256;
    }
    return out;
  };
}

/** Proveedor que CAMBIA en cada llamada (para forzar claves distintas entre reintentos). */
function varyingBytes(): (n: number) => Uint8Array {
  let call = 0;
  return (n: number) => {
    call += 1;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (call * 31 + i) % 256;
    }
    return out;
  };
}

// -----------------------------------------------------------------------------
// Núcleo puro: generateServiceKey / hashServiceKey / prefijo / formato
// -----------------------------------------------------------------------------

describe("generateServiceKey — clave, hash y prefijo", () => {
  it("produce una clave con el formato sk_recep_<43 base62>", () => {
    const { key } = generateServiceKey(fixedBytes(7));
    expect(key).toMatch(SERVICE_KEY_FORMAT);
    expect(key.startsWith(SERVICE_KEY_SCHEME)).toBe(true);
    expect(key).toHaveLength(SERVICE_KEY_SCHEME.length + SERVICE_KEY_TOKEN_LENGTH);
  });

  it("el keyHash es el SHA-256 hex minúsculas de la clave (casa con el CHECK de la tabla)", () => {
    const { key, keyHash } = generateServiceKey(fixedBytes(7));
    const independent = createHash("sha256").update(key, "utf8").digest("hex");
    expect(keyHash).toBe(independent);
    expect(keyHash).toMatch(SHA256_HEX_LOWER);
  });

  it("el keyPrefix son los primeros caracteres de la clave y cabe en el CHECK 3..24", () => {
    const { key, keyPrefix } = generateServiceKey(fixedBytes(7));
    expect(keyPrefix).toBe(key.slice(0, SERVICE_KEY_PREFIX_LENGTH));
    expect(keyPrefix.startsWith(SERVICE_KEY_SCHEME)).toBe(true);
    expect(keyPrefix.length).toBeGreaterThanOrEqual(3);
    expect(keyPrefix.length).toBeLessThanOrEqual(24);
  });

  it("el prefijo NO revela la clave: es más corto y no coincide con ella ni con su hash", () => {
    const { key, keyHash, keyPrefix } = generateServiceKey(fixedBytes(7));
    expect(keyPrefix.length).toBeLessThan(key.length);
    expect(keyPrefix).not.toBe(key);
    expect(keyPrefix).not.toBe(keyHash);
  });

  it("es determinista: los mismos bytes producen la misma clave, hash y prefijo", () => {
    const a = generateServiceKey(fixedBytes(42));
    const b = generateServiceKey(fixedBytes(42));
    expect(a).toEqual(b);
  });

  it("bytes distintos producen claves y hashes distintos", () => {
    const a = generateServiceKey(fixedBytes(1));
    const b = generateServiceKey(fixedBytes(2));
    expect(a.key).not.toBe(b.key);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it("lanza si el proveedor entrega menos entropía de la exigida (nunca degradar en silencio)", () => {
    const tooFew = (_: number) => new Uint8Array(SERVICE_KEY_RANDOM_BYTES - 1);
    expect(() => generateServiceKey(tooFew)).toThrow();
  });
});

describe("hashServiceKey — SHA-256 hex minúsculas", () => {
  it("devuelve 64 hex en minúsculas y es determinista", () => {
    const h1 = hashServiceKey("sk_recep_ejemplo");
    const h2 = hashServiceKey("sk_recep_ejemplo");
    expect(h1).toBe(h2);
    expect(h1).toMatch(SHA256_HEX_LOWER);
  });

  it("coincide con un SHA-256 calculado de forma independiente", () => {
    const key = "sk_recep_" + "a".repeat(SERVICE_KEY_TOKEN_LENGTH);
    expect(hashServiceKey(key)).toBe(
      createHash("sha256").update(key, "utf8").digest("hex"),
    );
  });
});

describe("serviceKeyPrefix / isValidServiceKeyFormat", () => {
  it("serviceKeyPrefix recorta a la longitud del prefijo almacenable", () => {
    const { key } = generateServiceKey(fixedBytes(3));
    expect(serviceKeyPrefix(key)).toHaveLength(SERVICE_KEY_PREFIX_LENGTH);
  });

  it("acepta una clave recién generada", () => {
    const { key } = generateServiceKey(fixedBytes(9));
    expect(isValidServiceKeyFormat(key)).toBe(true);
  });

  it("rechaza esquema erróneo, longitud incorrecta, caracteres no base62 y no-cadenas", () => {
    const token = "a".repeat(SERVICE_KEY_TOKEN_LENGTH);
    expect(isValidServiceKeyFormat("sk_live_" + token)).toBe(false); // otro esquema
    expect(isValidServiceKeyFormat("sk_recep_" + "a".repeat(10))).toBe(false); // corta
    expect(isValidServiceKeyFormat("sk_recep_" + "a".repeat(60))).toBe(false); // larga
    expect(isValidServiceKeyFormat("sk_recep_" + "-".repeat(SERVICE_KEY_TOKEN_LENGTH))).toBe(false); // no base62
    expect(isValidServiceKeyFormat("")).toBe(false);
    expect(isValidServiceKeyFormat(null)).toBe(false);
    expect(isValidServiceKeyFormat(12345)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Emisión: issueServiceApiKey con un cliente admin FALSO
// -----------------------------------------------------------------------------

type FakeAdmin = NonNullable<IssueServiceApiKeyDeps["admin"]>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

interface FakeAdminConfig {
  /** Resultado de la búsqueda del salón (`salons`). */
  salon: QueryResult;
  /** Resultados sucesivos de cada INSERT (para cubrir reintentos). */
  inserts?: QueryResult[];
  /** Se invoca con el payload EXACTO de cada INSERT (para auditarlo). */
  onInsert?: (payload: Record<string, unknown>) => void;
}

/** Cliente admin falso: enruta `salons` (lectura) y `service_api_keys` (INSERT). */
function fakeAdmin(config: FakeAdminConfig): FakeAdmin {
  let insertIndex = 0;
  const client = {
    from(table: string) {
      if (table === "salons") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => Promise.resolve(config.salon),
        };
        return builder;
      }
      if (table === "service_api_keys") {
        return {
          insert(payload: Record<string, unknown>) {
            config.onInsert?.(payload);
            const results = config.inserts ?? [];
            const result =
              results[Math.min(insertIndex, results.length - 1)] ??
              ({ data: null, error: { message: "sin resultado configurado" } } as QueryResult);
            insertIndex += 1;
            const builder = {
              select: () => builder,
              single: () => Promise.resolve(result),
            };
            return builder;
          },
        };
      }
      throw new Error(`fakeAdmin: tabla inesperada '${table}'`);
    },
  };
  return client as unknown as FakeAdmin;
}

const OK_SALON: QueryResult = { data: { id: "salon-1" }, error: null };
const CREATED_AT = "2026-07-22T10:00:00.000Z";

/** Nombres de columna que serían un secreto en claro y que JAMÁS deben persistirse. */
const FORBIDDEN_PLAINTEXT_COLUMNS = [
  "key",
  "api_key",
  "apikey",
  "secret",
  "secret_key",
  "raw_key",
  "plain_key",
  "plaintext",
  "token",
  "password",
];

describe("issueServiceApiKey — persiste SOLO hash + prefijo y devuelve la clave UNA vez", () => {
  it("inserta salon_id, name, key_hash, key_prefix y scopes — y NUNCA la clave en claro", async () => {
    let captured: Record<string, unknown> | null = null;
    const result = await issueServiceApiKey(
      { salonId: "salon-1", name: "ERP contable", scopes: ["loyalty:write"] },
      {
        randomBytes: fixedBytes(11),
        admin: fakeAdmin({
          salon: OK_SALON,
          inserts: [{ data: { id: "key-1", created_at: CREATED_AT }, error: null }],
          onInsert: (payload) => {
            captured = payload;
          },
        }),
      },
    );

    // La clave en claro se devuelve UNA vez y tiene el formato esperado.
    expect(result.key).toMatch(SERVICE_KEY_FORMAT);
    expect(result.id).toBe("key-1");
    expect(result.createdAt).toBe(CREATED_AT);
    expect(result.scopes).toEqual(["loyalty:write"]);

    // El payload persistido: exactamente las columnas permitidas.
    const payload = captured as unknown as Record<string, unknown>;
    expect(payload).not.toBeNull();
    expect(Object.keys(payload).sort()).toEqual(
      ["key_hash", "key_prefix", "name", "salon_id", "scopes"].sort(),
    );

    // La clave en claro NO aparece por ninguna columna…
    for (const value of Object.values(payload)) {
      expect(value).not.toBe(result.key);
    }
    // …ni por una columna con nombre de secreto en claro.
    for (const forbidden of FORBIDDEN_PLAINTEXT_COLUMNS) {
      expect(Object.prototype.hasOwnProperty.call(payload, forbidden)).toBe(false);
    }

    // Lo persistido es el hash de la clave devuelta (verificable) y su prefijo.
    expect(payload.key_hash).toBe(hashServiceKey(result.key));
    expect(payload.key_hash).toMatch(SHA256_HEX_LOWER);
    expect(payload.key_prefix).toBe(result.keyPrefix);
    expect(result.key.startsWith(result.keyPrefix)).toBe(true);
  });

  it("normaliza los scopes: recorta, descarta vacíos y deduplica conservando orden", async () => {
    let captured: Record<string, unknown> | null = null;
    const result = await issueServiceApiKey(
      { salonId: "salon-1", name: "Webhook", scopes: [" loyalty:write ", "loyalty:write", "", "reservas:read"] },
      {
        randomBytes: fixedBytes(5),
        admin: fakeAdmin({
          salon: OK_SALON,
          inserts: [{ data: { id: "key-2", created_at: CREATED_AT }, error: null }],
          onInsert: (payload) => {
            captured = payload;
          },
        }),
      },
    );
    expect(result.scopes).toEqual(["loyalty:write", "reservas:read"]);
    expect((captured as unknown as Record<string, unknown>).scopes).toEqual([
      "loyalty:write",
      "reservas:read",
    ]);
  });

  it("sin scopes, persiste un array vacío (clave sin permisos)", async () => {
    let captured: Record<string, unknown> | null = null;
    await issueServiceApiKey(
      { salonId: "salon-1", name: "Sin permisos" },
      {
        randomBytes: fixedBytes(5),
        admin: fakeAdmin({
          salon: OK_SALON,
          inserts: [{ data: { id: "key-3", created_at: CREATED_AT }, error: null }],
          onInsert: (payload) => {
            captured = payload;
          },
        }),
      },
    );
    expect((captured as unknown as Record<string, unknown>).scopes).toEqual([]);
  });
});

describe("issueServiceApiKey — validación y errores", () => {
  it("exige salon_id (invalid_request 400) y no toca la BD", async () => {
    let insertCalled = false;
    await expect(
      issueServiceApiKey(
        { salonId: "  ", name: "X" },
        {
          randomBytes: fixedBytes(1),
          admin: fakeAdmin({ salon: OK_SALON, onInsert: () => (insertCalled = true) }),
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(insertCalled).toBe(false);
  });

  it("exige nombre 1..120 (vacío, solo espacios y demasiado largo → 400)", async () => {
    const admin = fakeAdmin({ salon: OK_SALON });
    for (const name of ["", "   ", "n".repeat(121)]) {
      await expect(
        issueServiceApiKey({ salonId: "salon-1", name }, { randomBytes: fixedBytes(1), admin }),
      ).rejects.toBeInstanceOf(ServiceKeyError);
    }
  });

  it("scope no-cadena → invalid_request 400", async () => {
    await expect(
      issueServiceApiKey(
        // @ts-expect-error probamos entrada inválida en runtime
        { salonId: "salon-1", name: "X", scopes: [123] },
        { randomBytes: fixedBytes(1), admin: fakeAdmin({ salon: OK_SALON }) },
      ),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
  });

  it("salón inexistente → salon_not_found 404 y no intenta insertar", async () => {
    let insertCalled = false;
    await expect(
      issueServiceApiKey(
        { salonId: "fantasma", name: "X" },
        {
          randomBytes: fixedBytes(1),
          admin: fakeAdmin({
            salon: { data: null, error: null },
            onInsert: () => (insertCalled = true),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "salon_not_found", status: 404 });
    expect(insertCalled).toBe(false);
  });

  it("error al leer el salón → internal 500", async () => {
    await expect(
      issueServiceApiKey(
        { salonId: "salon-1", name: "X" },
        {
          randomBytes: fixedBytes(1),
          admin: fakeAdmin({ salon: { data: null, error: { message: "boom" } } }),
        },
      ),
    ).rejects.toMatchObject({ code: "internal", status: 500 });
  });
});

describe("issueServiceApiKey — carrera del key_hash UNIQUE (23505)", () => {
  it("reintenta ante 23505 y acaba emitiendo una clave distinta", async () => {
    let inserts = 0;
    const result = await issueServiceApiKey(
      { salonId: "salon-1", name: "Reintento" },
      {
        randomBytes: varyingBytes(), // cada intento produce una clave distinta
        admin: fakeAdmin({
          salon: OK_SALON,
          inserts: [
            { data: null, error: { code: "23505", message: "duplicate key" } },
            { data: { id: "key-ok", created_at: CREATED_AT }, error: null },
          ],
          onInsert: () => (inserts += 1),
        }),
      },
    );
    expect(inserts).toBe(2);
    expect(result.id).toBe("key-ok");
    expect(result.key).toMatch(SERVICE_KEY_FORMAT);
  });

  it("si TODOS los intentos colisionan, falla con internal 500", async () => {
    let inserts = 0;
    await expect(
      issueServiceApiKey(
        { salonId: "salon-1", name: "Imposible" },
        {
          randomBytes: varyingBytes(),
          admin: fakeAdmin({
            salon: OK_SALON,
            inserts: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
            onInsert: () => (inserts += 1),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "internal", status: 500 });
    expect(inserts).toBeGreaterThan(1);
  });

  it("un error de BD que no es colisión → internal 500 sin reintentar en bucle", async () => {
    let inserts = 0;
    await expect(
      issueServiceApiKey(
        { salonId: "salon-1", name: "X" },
        {
          randomBytes: fixedBytes(1),
          admin: fakeAdmin({
            salon: OK_SALON,
            inserts: [{ data: null, error: { code: "23514", message: "check violation" } }],
            onInsert: () => (inserts += 1),
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "internal", status: 500 });
    expect(inserts).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Verificación: readServiceApiKeyHeader / authenticateServiceApiKey /
// requireServiceApiKey con un cliente admin FALSO (nunca toca la BD real).
//
// El contrato de seguridad que se prueba (lado-lectura de service_api_keys):
//   · FAIL-CLOSED al autenticar: cabecera ausente/vacía, formato ajeno, clave
//     desconocida, clave revocada (is_active=false) o error de lectura ⇒ `null`.
//   · La búsqueda es por SHA-256(clave) con `is_active = true`, y la proyección
//     NUNCA trae `key_hash` (un secreto no sale de la BD).
//   · La identidad devuelta no expone ni la clave en claro ni su hash.
//   · El sello `last_used_at` es BEST-EFFORT (fail-open): si su escritura falla
//     —devuelve error o LANZA— una clave válida no se invalida.
// -----------------------------------------------------------------------------

type VerifyAdmin = NonNullable<AuthenticateServiceApiKeyDeps["admin"]>;

/** Una llamada de lectura capturada: columnas proyectadas y filtros aplicados. */
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
}
/** Una llamada de sello capturada: payload del UPDATE y filtro (por id). */
interface UpdateCall {
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
}

interface FakeVerifyConfig {
  /** Resultado de la búsqueda por (key_hash, is_active). */
  select: QueryResult;
  /** Resultado del sello last_used_at (por defecto, éxito silencioso). */
  update?: QueryResult;
  /** Si es true, la escritura del sello LANZA (simula fallo de red, no un error PostgREST). */
  updateThrows?: boolean;
}

/**
 * Cliente admin FALSO para la verificación. Enruta SOLO `service_api_keys` y modela
 * las dos operaciones del helper: el SELECT de búsqueda (`.select().eq().eq().maybeSingle()`)
 * y el UPDATE del sello (`.update().eq()`). Captura cada interacción para poder
 * auditar columnas, filtros y payloads.
 */
function fakeVerifyAdmin(config: FakeVerifyConfig): {
  admin: VerifyAdmin;
  selects: SelectCall[];
  updates: UpdateCall[];
} {
  const selects: SelectCall[] = [];
  const updates: UpdateCall[] = [];
  const client = {
    from(table: string) {
      if (table !== "service_api_keys") {
        throw new Error(`fakeVerifyAdmin: tabla inesperada '${table}'`);
      }
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
          selects.push({ columns, filters: { ...filters } });
          return Promise.resolve(config.select);
        },
        update(payload: Record<string, unknown>) {
          const updateFilters: Record<string, unknown> = {};
          return {
            eq(col: string, val: unknown) {
              updateFilters[col] = val;
              updates.push({ payload, filters: { ...updateFilters } });
              if (config.updateThrows === true) {
                return Promise.reject(new Error("fallo de red al sellar last_used_at"));
              }
              return Promise.resolve(config.update ?? { data: null, error: null });
            },
          };
        },
      };
      return builder;
    },
  };
  return { admin: client as unknown as VerifyAdmin, selects, updates };
}

/** Construye unos `Headers` con la cabecera x-api-key (o sin ella si key es null). */
function headersWithKey(
  key: string | null,
  headerName: string = SERVICE_API_KEY_HEADER,
): Headers {
  const h = new Headers();
  if (key !== null) h.set(headerName, key);
  return h;
}

/** Reloj fijo para verificar el sello last_used_at de forma determinista. */
const NOW_ISO = "2026-07-23T09:30:00.000Z";

/** Fila de lectura NO secreta que devolvería la BD para una clave válida y activa. */
function okRow(keyPrefix: string, over: Partial<Record<string, unknown>> = {}): QueryResult {
  return {
    data: { id: "key-1", salon_id: "salon-9", scopes: [], key_prefix: keyPrefix, ...over },
    error: null,
  };
}

describe("readServiceApiKeyHeader", () => {
  it("lee la clave de x-api-key (insensible a mayúsculas) y la recorta", () => {
    expect(readServiceApiKeyHeader(headersWithKey("sk_recep_abc"))).toBe("sk_recep_abc");
    // La cabecera Fetch es case-insensitive: X-API-KEY también vale.
    expect(readServiceApiKeyHeader(headersWithKey("sk_recep_abc", "X-API-KEY"))).toBe(
      "sk_recep_abc",
    );
    expect(readServiceApiKeyHeader(headersWithKey("  sk_recep_abc  "))).toBe("sk_recep_abc");
  });

  it("devuelve null si la cabecera falta o queda vacía tras recortar", () => {
    expect(readServiceApiKeyHeader(headersWithKey(null))).toBeNull();
    expect(readServiceApiKeyHeader(headersWithKey("   "))).toBeNull();
  });
});

describe("authenticateServiceApiKey — clave válida y activa", () => {
  it("resuelve la identidad del salón (busca por SHA-256+is_active) y NO expone clave ni hash", async () => {
    const { key, keyHash, keyPrefix } = generateServiceKey(fixedBytes(21));
    const { admin, selects } = fakeVerifyAdmin({
      select: okRow(keyPrefix, {
        id: "key-1",
        salon_id: "salon-9",
        scopes: ["loyalty:write"],
      }),
    });

    const identity = await authenticateServiceApiKey(headersWithKey(key), {
      admin,
      now: () => NOW_ISO,
    });

    expect(identity).toEqual({
      keyId: "key-1",
      salonId: "salon-9",
      scopes: ["loyalty:write"],
      keyPrefix,
    });

    // Se busca por el hash de la clave entrante y SOLO filas activas…
    expect(selects).toHaveLength(1);
    expect(selects[0]!.filters).toEqual({ key_hash: keyHash, is_active: true });
    // …y la proyección NO trae el key_hash (un secreto no sale de la BD).
    expect(selects[0]!.columns).not.toContain("key_hash");

    // La identidad no contiene ni la clave en claro ni su hash por ninguna propiedad.
    for (const value of Object.values(identity as unknown as Record<string, unknown>)) {
      expect(value).not.toBe(key);
      expect(value).not.toBe(keyHash);
    }
  });

  it("sella last_used_at = now() sobre la fila correcta (filtrada por id)", async () => {
    const { key, keyPrefix } = generateServiceKey(fixedBytes(22));
    const { admin, updates } = fakeVerifyAdmin({
      select: okRow(keyPrefix, { id: "key-77" }),
    });

    await authenticateServiceApiKey(headersWithKey(key), { admin, now: () => NOW_ISO });

    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toEqual({ last_used_at: NOW_ISO });
    expect(updates[0]!.filters).toEqual({ id: "key-77" });
  });
});

describe("authenticateServiceApiKey — rechazo (devuelve null, FAIL-CLOSED)", () => {
  it("sin cabecera → null y NO toca la BD (ni busca ni sella)", async () => {
    const { admin, selects, updates } = fakeVerifyAdmin({ select: { data: null, error: null } });
    expect(await authenticateServiceApiKey(headersWithKey(null), { admin })).toBeNull();
    expect(selects).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("clave con formato ajeno → null SIN hashear ni consultar (filtro barato)", async () => {
    const { admin, selects } = fakeVerifyAdmin({ select: { data: null, error: null } });
    const malformed = [
      "no-es-una-clave",
      "sk_live_" + "a".repeat(SERVICE_KEY_TOKEN_LENGTH), // otro esquema
      "sk_recep_" + "a".repeat(10), // longitud incorrecta
      "sk_recep_" + "-".repeat(SERVICE_KEY_TOKEN_LENGTH), // no base62
    ];
    for (const bad of malformed) {
      expect(await authenticateServiceApiKey(headersWithKey(bad), { admin })).toBeNull();
    }
    expect(selects).toHaveLength(0);
  });

  it("clave desconocida (sin fila) → null y no sella nada", async () => {
    const { key } = generateServiceKey(fixedBytes(23));
    const { admin, selects, updates } = fakeVerifyAdmin({ select: { data: null, error: null } });
    expect(await authenticateServiceApiKey(headersWithKey(key), { admin })).toBeNull();
    expect(selects).toHaveLength(1); // sí consultó (la clave tenía formato válido)…
    expect(updates).toHaveLength(0); // …pero al no haber identidad, no sella.
  });

  it("clave revocada: el filtro is_active=true la excluye → sin fila → null", async () => {
    // Una clave revocada existe en la tabla pero con is_active=false; como el helper
    // filtra `is_active = true`, la BD no devuelve fila. Se modela como data=null.
    const { key } = generateServiceKey(fixedBytes(24));
    const { admin } = fakeVerifyAdmin({ select: { data: null, error: null } });
    expect(await authenticateServiceApiKey(headersWithKey(key), { admin })).toBeNull();
  });

  it("error de lectura → null (FAIL-CLOSED) y NO sella last_used_at", async () => {
    const { key } = generateServiceKey(fixedBytes(25));
    const { admin, updates } = fakeVerifyAdmin({
      select: { data: null, error: { message: "boom" } },
    });
    expect(await authenticateServiceApiKey(headersWithKey(key), { admin })).toBeNull();
    expect(updates).toHaveLength(0);
  });
});

describe("authenticateServiceApiKey — el sello last_used_at es best-effort (fail-open)", () => {
  it("si el sello DEVUELVE error, la clave válida NO se invalida", async () => {
    const { key, keyPrefix } = generateServiceKey(fixedBytes(26));
    const { admin } = fakeVerifyAdmin({
      select: okRow(keyPrefix, { salon_id: "s" }),
      update: { data: null, error: { message: "no se pudo sellar" } },
    });
    const identity = await authenticateServiceApiKey(headersWithKey(key), {
      admin,
      now: () => NOW_ISO,
    });
    expect(identity).not.toBeNull();
    expect(identity!.salonId).toBe("s");
  });

  it("si el sello LANZA (fallo de red en la escritura), la clave válida NO se invalida", async () => {
    const { key, keyPrefix } = generateServiceKey(fixedBytes(27));
    const { admin } = fakeVerifyAdmin({
      select: okRow(keyPrefix, { salon_id: "s" }),
      updateThrows: true,
    });
    const identity = await authenticateServiceApiKey(headersWithKey(key), {
      admin,
      now: () => NOW_ISO,
    });
    expect(identity).not.toBeNull();
    expect(identity!.salonId).toBe("s");
  });
});

describe("requireServiceApiKey — exige clave válida o lanza 401", () => {
  it("devuelve la identidad cuando la clave es válida y activa", async () => {
    const { key, keyPrefix } = generateServiceKey(fixedBytes(28));
    const { admin } = fakeVerifyAdmin({ select: okRow(keyPrefix, { salon_id: "s" }) });
    const identity = await requireServiceApiKey(headersWithKey(key), { admin, now: () => NOW_ISO });
    expect(identity.salonId).toBe("s");
  });

  it("lanza ReceptionError UNAUTHORIZED (401) cuando no hay clave válida", async () => {
    const { admin } = fakeVerifyAdmin({ select: { data: null, error: null } });
    await expect(
      requireServiceApiKey(headersWithKey(null), { admin }),
    ).rejects.toBeInstanceOf(ReceptionError);
    await expect(requireServiceApiKey(headersWithKey(null), { admin })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});
