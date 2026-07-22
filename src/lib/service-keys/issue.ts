/**
 * Emisión de claves de servicio (`service_api_keys`) — acción de SERVIDOR con
 * service_role. Es la ÚNICA vía por la que nace una clave de API de recepción.
 *
 * ── Quién puede emitir: SOLO HAT3X (service_role/backoffice) ─────────────────
 * La emisión es una operación de plataforma, no de producto: el SALÓN NO SE
 * AUTOGENERA claves. Este módulo lo garantiza por CONSTRUCCIÓN, no por permiso:
 *   · Usa el cliente ADMIN (`createAdminClient`, service_role) —la tabla es de
 *     secretos con RLS deny-by-default y privilegios revocados a anon/authenticated
 *     (migración 20260722100000); ni el owner del salón puede escribir en ella—.
 *   · Es server-only (importa `node:crypto` y el cliente admin): si se importara
 *     desde un componente cliente, la service-role key sería `undefined` y
 *     `createAdminClient` lanzaría. NUNCA exponer esa clave al navegador.
 *   · DELIBERADAMENTE no se expone ninguna Server Action ni Route Handler que un
 *     usuario del salón pueda invocar. La emisión se dispara desde un contexto de
 *     HAT3X (script/consola de operaciones o endpoint de backoffice protegido).
 *     Ausencia de superficie self-service = imposibilidad de autoemisión.
 *     Procedimiento operativo (cómo dispararla, entrega segura, rotación y
 *     revocación): docs/service-keys-emision.md.
 *
 * ── Qué persiste y qué devuelve ─────────────────────────────────────────────
 * Guarda en `service_api_keys` SOLO `(salon_id, name, key_hash, key_prefix,
 * scopes)` — nunca la clave en claro (ver `@/lib/service-keys/keys`). Devuelve la
 * clave en claro UNA sola vez en {@link IssuedServiceApiKey.key}: HAT3X la entrega
 * al integrador por un canal seguro y NO se vuelve a poder recuperar (si se pierde,
 * se revoca y se emite otra). El resto de campos (id, prefix, scopes…) sí son
 * recuperables después para administración; el secreto no.
 */
import { randomBytes as nodeRandomBytes } from "node:crypto";

import { generateServiceKey } from "@/lib/service-keys/keys";
import { createAdminClient } from "@/lib/supabase/admin";

/** Cliente Supabase con service_role (omite RLS). Ver `@/lib/supabase/admin`. */
type AdminClient = ReturnType<typeof createAdminClient>;

/** Longitud máxima del nombre (espeja el CHECK `char_length(btrim(name)) 1..120`). */
const NAME_MAX_LENGTH = 120;

/**
 * Reintentos ante colisión del `key_hash` UNIQUE. Con 256 bits de entropía una
 * colisión es astronómicamente improbable; el bucle existe por rigor, no porque
 * se espere que ocurra.
 */
const MAX_INSERT_ATTEMPTS = 5;

/** Código de error de dominio → estado HTTP con el que traducirlo en el borde. */
export type ServiceKeyErrorCode = "invalid_request" | "salon_not_found" | "internal";

/**
 * Error de dominio de la emisión de claves, con estado HTTP asociado (mismo patrón
 * que `LoyaltyActionError`/`BookingError`). Los mensajes son legibles y NUNCA
 * filtran detalle interno (SQL, stack) ni, por supuesto, la clave en claro.
 */
export class ServiceKeyError extends Error {
  constructor(
    public readonly code: ServiceKeyErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceKeyError";
  }
}

/** Entrada de {@link issueServiceApiKey}. */
export interface IssueServiceApiKeyInput {
  /** Salón en cuyo nombre actuará la integración. Debe existir. */
  salonId: string;
  /** Etiqueta legible para identificar la clave ("ERP contable"). 1..120 chars. */
  name: string;
  /** Ámbitos/permisos concedidos (p. ej. `["loyalty:write"]`). Vacío por defecto. */
  scopes?: readonly string[];
}

/**
 * Resultado de una emisión. Contiene la clave en claro `key` que se muestra UNA
 * vez; el llamador debe entregarla al integrador y NO registrarla en logs ni
 * volver a persistirla.
 */
export interface IssuedServiceApiKey {
  /** Id de la fila en `service_api_keys` (para administrarla/revocarla luego). */
  id: string;
  /** Salón propietario de la clave. */
  salonId: string;
  /** Etiqueta legible de la clave. */
  name: string;
  /** Clave COMPLETA en claro (`sk_recep_…`). ÚNICA vez que existe fuera de un hash. */
  key: string;
  /** Prefijo NO secreto guardado, para identificar la clave en un panel. */
  keyPrefix: string;
  /** Ámbitos concedidos (normalizados: sin vacíos ni duplicados). */
  scopes: string[];
  /** Sello de creación (ISO-8601) devuelto por la BD. */
  createdAt: string;
}

/** Dependencias inyectables (para tests deterministas). Producción usa los defaults. */
export interface IssueServiceApiKeyDeps {
  /** Proveedor de bytes; por defecto `node:crypto`. */
  randomBytes?: (n: number) => Uint8Array;
  /** Cliente admin; por defecto `createAdminClient()` (service_role real). */
  admin?: AdminClient;
}

/**
 * Emite una clave de servicio para un salón y la devuelve en claro UNA sola vez.
 *
 * Flujo:
 *   1. Valida la entrada (salón obligatorio; nombre 1..120; scopes sin vacíos).
 *   2. Comprueba que el salón existe (404 limpio en vez de un error de FK opaco).
 *   3. Genera la clave (`sk_recep_…`), calcula su hash y prefijo, e INSERTA solo
 *      `(salon_id, name, key_hash, key_prefix, scopes)` — nunca la clave en claro.
 *   4. Devuelve `{ id, key, keyPrefix, … }`. `key` es irrecuperable después.
 *
 * @throws {ServiceKeyError} `invalid_request` (400) si la entrada no es válida;
 *   `salon_not_found` (404) si el salón no existe; `internal` (500) ante fallo de BD.
 */
export async function issueServiceApiKey(
  input: IssueServiceApiKeyInput,
  deps: IssueServiceApiKeyDeps = {},
): Promise<IssuedServiceApiKey> {
  const salonId = (input.salonId ?? "").trim();
  if (salonId === "") {
    throw new ServiceKeyError("invalid_request", 400, "salon_id es obligatorio.");
  }

  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    throw new ServiceKeyError(
      "invalid_request",
      400,
      `El nombre de la clave debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres.`,
    );
  }

  const scopes = normalizeScopes(input.scopes);

  const admin = deps.admin ?? createAdminClient();
  const randomBytes = deps.randomBytes ?? ((n: number) => nodeRandomBytes(n));

  // Salón existente → 404 claro (en vez de esperar al 23503 de la FK).
  const { data: salon, error: salonError } = await admin
    .from("salons")
    .select("id")
    .eq("id", salonId)
    .maybeSingle();
  if (salonError !== null) {
    throw new ServiceKeyError("internal", 500, "No se pudo verificar el salón.");
  }
  if (salon === null) {
    throw new ServiceKeyError("salon_not_found", 404, "El salón indicado no existe.");
  }

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const generated = generateServiceKey(randomBytes);

    const { data, error } = await admin
      .from("service_api_keys")
      .insert({
        salon_id: salonId,
        name,
        key_hash: generated.keyHash,
        key_prefix: generated.keyPrefix,
        scopes,
      })
      .select("id, created_at")
      .single();

    if (error === null && data !== null) {
      return {
        id: data.id,
        salonId,
        name,
        key: generated.key,
        keyPrefix: generated.keyPrefix,
        scopes,
        createdAt: data.created_at,
      };
    }

    // 23505 = unique_violation sobre key_hash → regenerar (prácticamente imposible).
    if (error !== null && error.code === "23505") {
      continue;
    }
    // 23503 = foreign_key_violation → el salón desapareció entre el chequeo y aquí.
    if (error !== null && error.code === "23503") {
      throw new ServiceKeyError("salon_not_found", 404, "El salón indicado no existe.");
    }
    throw new ServiceKeyError("internal", 500, "No se pudo emitir la clave de servicio.");
  }

  throw new ServiceKeyError(
    "internal",
    500,
    "No se pudo emitir una clave única. Inténtalo de nuevo.",
  );
}

/**
 * Normaliza los scopes: descarta no-cadenas (400), recorta, elimina vacíos y
 * duplicados conservando el orden. `undefined` ⇒ `[]` (clave sin permisos hasta
 * que se le asignen). Cumple el CHECK `array_position(scopes, null) is null`.
 */
function normalizeScopes(scopes: readonly string[] | undefined): string[] {
  if (scopes === undefined) {
    return [];
  }
  const cleaned: string[] = [];
  for (const scope of scopes) {
    if (typeof scope !== "string") {
      throw new ServiceKeyError("invalid_request", 400, "Los scopes deben ser cadenas.");
    }
    const trimmed = scope.trim();
    if (trimmed !== "" && !cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}
