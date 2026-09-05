/**
 * VERIFICACIÓN de claves de servicio (autenticación NO-humana por cabecera
 * `x-api-key`). Es el lado-LECTURA de `public.service_api_keys`; su hermano de
 * escritura es la EMISIÓN (`@/lib/service-keys/issue`) y ambos comparten el núcleo
 * puro `@/lib/service-keys/keys` (hash y formato).
 *
 * Dada la clave que presenta una integración externa (webhook, ERP, portal de
 * terceros), decide en nombre de QUÉ salón actúa —o la rechaza—. Implementa el
 * "CONTRATO CON EL CONSUMIDOR" que la migración 20260722100000 documenta:
 *
 *   1. Hashear la clave entrante con SHA-256 (hex minúsculas) — mismo cálculo que
 *      al emitir, así que casa con `key_hash` (que solo guarda ese digest).
 *   2. Buscar la fila por `key_hash` con `is_active = true`.
 *   3. Si existe → devolver la identidad (salón + ámbitos) y sellar `last_used_at`.
 *      Si no → devolver `null` (no autenticado).
 *
 * ── SERVER-ONLY ──────────────────────────────────────────────────────────────
 * Usa el cliente Supabase de SERVICE ROLE ({@link createAdminClient}), que bypasa
 * RLS y es el ÚNICO que puede leer esta tabla de secretos (a `anon` y
 * `authenticated` se les revocaron los privilegios). Ese cliente depende de
 * `SUPABASE_SERVICE_ROLE_KEY`, una variable SIN el prefijo `NEXT_PUBLIC_`: solo
 * existe en el servidor. NUNCA importar este módulo desde código de cliente.
 *
 * ── QUÉ NO HACE (y por qué) ──────────────────────────────────────────────────
 *   · No compara la clave en claro contra nada: la BD solo guarda su hash, así que
 *     autenticar = "¿existe una fila ACTIVA cuyo `key_hash` sea SHA-256(clave)?".
 *     No hay comparación de secretos en memoria → no aplica timing-safe compare
 *     (un atacante necesitaría una preimagen de SHA-256, no adivinar byte a byte).
 *   · No decide permisos: devuelve los `scopes` para que el llamador AUTORICE la
 *     acción concreta. Autenticar ("quién eres") ≠ autorizar ("qué puedes hacer").
 */
import { ReceptionError } from "@/lib/reception/errors";
import { hashServiceKey, isValidServiceKeyFormat } from "@/lib/service-keys/keys";
import { createAdminClient } from "@/lib/supabase/admin";

/** Nombre canónico de la cabecera que porta la clave de servicio. */
export const SERVICE_API_KEY_HEADER = "x-api-key";

/**
 * Identidad resuelta de una clave de servicio válida. Todo lo que expone es NO
 * secreto: ni la clave en claro ni su hash salen nunca de aquí.
 */
export interface ServiceApiKeyIdentity {
  /** `id` de la fila en `service_api_keys` (útil para auditoría/logs). */
  readonly keyId: string;
  /** Salón en cuyo nombre actúa la integración. Es el dato central del contrato. */
  readonly salonId: string;
  /** Ámbitos/permisos de la clave (para AUTORIZAR la acción concreta después). */
  readonly scopes: readonly string[];
  /** Prefijo corto NO secreto (p. ej. "sk_recep_a1b2"), seguro para logs. */
  readonly keyPrefix: string;
}

/** Cliente Supabase con service_role (omite RLS). Ver `@/lib/supabase/admin`. */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Dependencias INYECTABLES de la verificación (para tests deterministas; en
 * producción se usan los defaults). Mismo patrón que `IssueServiceApiKeyDeps` en el
 * módulo hermano de emisión: nunca se abre una conexión real ni se lee la hora del
 * sistema en un test.
 */
export interface AuthenticateServiceApiKeyDeps {
  /** Cliente admin (service_role). Por defecto `createAdminClient()` (real). */
  admin?: AdminClient;
  /** Reloj para el sello `last_used_at`. Por defecto `() => new Date().toISOString()`. */
  now?: () => string;
}

/**
 * Extrae la clave de la cabecera `x-api-key` (insensible a mayúsculas por la Fetch
 * API) y la recorta. Devuelve `null` si falta o queda vacía tras recortar — el
 * llamador lo trata como "no autenticado" SIN tocar la BD.
 */
export function readServiceApiKeyHeader(headers: Headers): string | null {
  const raw = headers.get(SERVICE_API_KEY_HEADER);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Autentica una petición por su clave de servicio. Devuelve la identidad del salón
 * si la clave existe y está ACTIVA; `null` en cualquier otro caso: cabecera
 * ausente/vacía, con formato que NO es de una clave nuestra, clave desconocida,
 * clave revocada (`is_active = false`) o error de lectura (FAIL-CLOSED: mejor negar
 * una clave válida que conceder por un fallo transitorio).
 *
 * Efecto secundario en el acierto: sella `last_used_at = now()` con BEST-EFFORT. El
 * sello es telemetría, no una puerta de seguridad: si su escritura fallara, la
 * clave —por lo demás correcta— NO se invalida (fail-open SOLO para ese sello).
 */
export async function authenticateServiceApiKey(
  headers: Headers,
  deps: AuthenticateServiceApiKeyDeps = {},
): Promise<ServiceApiKeyIdentity | null> {
  const rawKey = readServiceApiKeyHeader(headers);
  if (rawKey === null) return null;

  // Filtro barato: descarta basura (o claves de otro esquema) ANTES de hashear o
  // consultar. Toda clave emitida cumple `SERVICE_KEY_FORMAT`, así que un valor que
  // no lo cumple no puede existir en la tabla.
  if (!isValidServiceKeyFormat(rawKey)) return null;

  const keyHash = hashServiceKey(rawKey);
  const admin: AdminClient = deps.admin ?? createAdminClient();

  // Se proyectan SOLO columnas NO secretas: el `key_hash` jamás sale de la BD.
  const { data, error } = await admin
    .from("service_api_keys")
    .select("id, salon_id, scopes, key_prefix")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  // FAIL-CLOSED: ante un error de lectura NO se concede acceso. Sin fila = clave
  // desconocida o revocada (el filtro `is_active = true` la excluye) → tampoco
  // autentica. En ambos casos, `null`.
  if (error !== null || data === null) return null;

  const identity: ServiceApiKeyIdentity = {
    keyId: data.id,
    salonId: data.salon_id,
    scopes: data.scopes,
    keyPrefix: data.key_prefix,
  };

  // Sello de último uso — BEST-EFFORT / fail-open SOLO para el sello. Es telemetría,
  // no una puerta de seguridad: se ignora el resultado Y se ATRAPA cualquier excepción
  // (p. ej. un fallo de red en la escritura). Una clave por lo demás correcta NUNCA se
  // rechaza porque el sello falle. Ojo con el contraste: el error de AUTENTICACIÓN es
  // fail-closed (arriba); el del SELLO es fail-open (aquí). Son decisiones distintas.
  const now = deps.now ?? (() => new Date().toISOString());
  try {
    await admin
      .from("service_api_keys")
      .update({ last_used_at: now() })
      .eq("id", identity.keyId);
  } catch {
    // Intencionadamente ignorado: ver comentario anterior (fail-open del sello).
  }

  return identity;
}

/**
 * Variante que EXIGE clave válida: igual que {@link authenticateServiceApiKey} pero
 * lanza `ReceptionError.unauthorized()` (401, contrato de `/api/reception`) en vez
 * de devolver `null`. Azúcar para Route Handlers que ya traducen `ReceptionError`
 * con `@/lib/reception/http`.
 */
export async function requireServiceApiKey(
  headers: Headers,
  deps: AuthenticateServiceApiKeyDeps = {},
): Promise<ServiceApiKeyIdentity> {
  const identity = await authenticateServiceApiKey(headers, deps);
  if (identity === null) throw ReceptionError.unauthorized();
  return identity;
}
