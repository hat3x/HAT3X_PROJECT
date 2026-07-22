/**
 * Núcleo PURO de las claves de servicio (`service_api_keys`) — generación,
 * hash y formato. Sin I/O ni estado: mismas entradas ⇒ mismas salidas, así que
 * es 100 % testeable sin base de datos (igual que `@/lib/invoicing/hash`).
 *
 * ── La regla de oro: la clave en claro vive UNA sola vez ─────────────────────
 * Una clave de API es una CREDENCIAL. Igual que una contraseña, la base de datos
 * NUNCA ve el secreto: solo guarda su HASH (`key_hash`) y un prefijo corto NO
 * secreto (`key_prefix`). La clave COMPLETA en claro solo existe en el momento de
 * emitirla —se le muestra al integrador y no se vuelve a poder recuperar—. Este
 * módulo produce las tres piezas de una sola pasada ({@link generateServiceKey}):
 *   · `key`       → la clave en claro `sk_recep_<token>` (se devuelve UNA vez).
 *   · `keyHash`   → SHA-256 hex MINÚSCULAS (64) de `key` — lo ÚNICO que va a la BD
 *                   y el punto de verificación (se hashea la clave entrante y se
 *                   busca por aquí). Casa con el CHECK `^[a-f0-9]{64}$` de la tabla.
 *   · `keyPrefix` → `sk_recep_` + primeros caracteres del token, para IDENTIFICAR
 *                   la clave en un panel sin poder reconstruirla. NO es secreto.
 *
 * ── Formato de la clave: `sk_recep_<token>` ─────────────────────────────────
 * `sk_recep_` marca el esquema (clave de RECEPCIÓN) de un vistazo, al estilo de
 * los `sk_live_…` de Stripe. `<token>` son 43 caracteres base62 `[0-9A-Za-z]`
 * derivados de 32 bytes (256 bits) de aleatoriedad criptográfica:
 *   · 256 bits ⇒ inadivinable por fuerza bruta.
 *   · base62 (sin `-`, `_`, `+`, `/`) ⇒ la clave se selecciona de un doble clic y
 *     se copia limpia; nada que escapar en URLs, JSON o cabeceras.
 * La conversión bytes→base62 es un cambio de base entero (bijección), así que NO
 * introduce sesgo de módulo: cada valor de 256 bits se representa de forma única
 * y equiprobable. El sufijo se rellena a la izquierda a longitud fija para que
 * toda clave mida lo mismo (`sk_recep_` + 43 = 52 caracteres).
 */
import { createHash } from "node:crypto";

/** Esquema/prefijo de las claves de recepción. Parte del CONTRATO (no se renombra). */
export const SERVICE_KEY_SCHEME = "sk_recep_";

/** Bytes de aleatoriedad criptográfica que respaldan cada clave (256 bits). */
export const SERVICE_KEY_RANDOM_BYTES = 32;

/**
 * Longitud fija del token base62 tras el esquema. 43 = ⌈256 / log2(62)⌉, el ancho
 * justo para representar 256 bits en base62 (62^43 > 2^256), a longitud constante.
 */
export const SERVICE_KEY_TOKEN_LENGTH = 43;

/**
 * Cuántos caracteres del token entran en `key_prefix` (además del esquema). El
 * prefijo identifica la clave en un panel; revelar unos pocos caracteres de un
 * secreto de 256 bits es inocuo (la entropía restante sigue siendo astronómica).
 */
export const SERVICE_KEY_PREFIX_TOKEN_CHARS = 6;

/**
 * Longitud del `key_prefix` almacenado (`sk_recep_` + primeros caracteres). Cae
 * dentro del CHECK `char_length(key_prefix) between 3 and 24` de la tabla.
 */
export const SERVICE_KEY_PREFIX_LENGTH =
  SERVICE_KEY_SCHEME.length + SERVICE_KEY_PREFIX_TOKEN_CHARS;

/** Alfabeto base62 (dígitos, mayúsculas, minúsculas). Orden = valor del dígito. */
const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Forma canónica de una clave de recepción, derivada de los constantes de arriba:
 * `sk_recep_` seguido de exactamente {@link SERVICE_KEY_TOKEN_LENGTH} caracteres
 * base62. Útil para RECHAZAR de un vistazo un valor que no puede ser una de
 * nuestras claves antes siquiera de hashear/consultar la BD.
 */
export const SERVICE_KEY_FORMAT = new RegExp(
  `^${SERVICE_KEY_SCHEME}[0-9A-Za-z]{${SERVICE_KEY_TOKEN_LENGTH}}$`,
);

/** Las tres piezas que produce una emisión (ver cabecera del módulo). */
export interface GeneratedServiceKey {
  /** Clave COMPLETA en claro (`sk_recep_…`). Se muestra UNA vez; jamás se persiste. */
  key: string;
  /** SHA-256 hex minúsculas (64). Lo ÚNICO que va a `key_hash`. */
  keyHash: string;
  /** Prefijo corto NO secreto. Va a `key_prefix`, solo para identificar la clave. */
  keyPrefix: string;
}

/**
 * SHA-256 en hex MINÚSCULAS (64 caracteres) de una clave. Determinista: es el
 * mismo cálculo al EMITIR (para guardar `key_hash`) y al VERIFICAR (se hashea la
 * clave entrante y se compara). En minúsculas para casar con el CHECK
 * `^[a-f0-9]{64}$` de `service_api_keys` (`digest("hex")` ya es minúsculas).
 */
export function hashServiceKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Prefijo NO secreto de una clave: `sk_recep_` + primeros caracteres del token.
 * Es lo que se guarda en `key_prefix` y lo único de la clave que un humano ve en
 * un panel. Se calcula por corte de longitud fija (nunca reconstruye el secreto).
 */
export function serviceKeyPrefix(key: string): string {
  return key.slice(0, SERVICE_KEY_PREFIX_LENGTH);
}

/**
 * ¿`value` tiene la forma de una clave de recepción (`sk_recep_` + 43 base62)?
 * Filtro barato para descartar basura antes de hashear/consultar. NO prueba que
 * la clave exista o esté activa: eso solo lo dice el `key_hash` contra la BD.
 */
export function isValidServiceKeyFormat(value: unknown): value is string {
  return typeof value === "string" && SERVICE_KEY_FORMAT.test(value);
}

/**
 * Codifica `bytes` como cadena base62 de ancho fijo `width`. Cambio de base entero
 * (big-endian) sin sesgo de módulo; se rellena por la izquierda con el dígito cero
 * para longitud constante. `width` debe bastar para el mayor valor posible.
 */
function encodeBase62(bytes: Uint8Array, width: number): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  let out = "";
  while (value > 0n) {
    out = BASE62_ALPHABET.charAt(Number(value % 62n)) + out;
    value = value / 62n;
  }
  return out.padStart(width, "0");
}

/**
 * Genera una clave de recepción a partir de un proveedor de bytes INYECTADO
 * (`node:crypto` en producción; determinista en tests, igual que
 * `randomRewardSuffix`). Devuelve la clave en claro y las dos piezas que se
 * persisten (`keyHash`, `keyPrefix`). El llamador de servidor la inserta en
 * `service_api_keys` y entrega `key` al integrador UNA sola vez.
 *
 * @param randomBytes proveedor de aleatoriedad; debe devolver al menos
 *   {@link SERVICE_KEY_RANDOM_BYTES} bytes criptográficamente seguros.
 * @throws si el proveedor devuelve menos bytes de los exigidos (nunca degradar
 *   la entropía en silencio).
 */
export function generateServiceKey(
  randomBytes: (n: number) => Uint8Array,
): GeneratedServiceKey {
  const bytes = randomBytes(SERVICE_KEY_RANDOM_BYTES);
  if (bytes.length < SERVICE_KEY_RANDOM_BYTES) {
    throw new Error(
      `generateServiceKey: se exigen ${SERVICE_KEY_RANDOM_BYTES} bytes de aleatoriedad y se recibieron ${bytes.length}.`,
    );
  }
  const material = bytes.subarray(0, SERVICE_KEY_RANDOM_BYTES);
  const token = encodeBase62(material, SERVICE_KEY_TOKEN_LENGTH);
  const key = `${SERVICE_KEY_SCHEME}${token}`;
  return {
    key,
    keyHash: hashServiceKey(key),
    keyPrefix: serviceKeyPrefix(key),
  };
}
