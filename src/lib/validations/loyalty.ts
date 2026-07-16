import { z } from "zod";

/**
 * Esquemas de validación del CUERPO de los Route Handlers de fidelización
 * (`POST /api/loyalty/lookup` y `POST /api/loyalty/verify-visit`).
 *
 * Estos handlers son un proxy servidor→denueveanueve: la `LOYALTY_API_KEY` vive
 * solo en el servidor y nunca llega al navegador. Por eso validamos el cuerpo
 * como *entrada no confiable* en el borde HTTP, además de la validación interna
 * que ya hace `@/lib/loyalty`:
 *
 *   · Acota longitudes y tamaños → mitiga cuerpos gigantes (DoS de memoria) que
 *     `request.json()` aceptaría sin límite.
 *   · Normaliza (`trim`) antes de reenviar.
 *   · Rechaza pronto lo inválido (400) sin gastar una llamada al upstream.
 *
 * Dinero SIEMPRE en enteros de céntimos (`*_cents`), coherente con
 * `@/lib/payments/money` y con el contrato del cliente de fidelización.
 */

/**
 * QR escaneado del cliente. Puede ser un código corto o un token firmado (JWT),
 * de ahí el tope holgado; el límite existe solo para acotar el tamaño del cuerpo.
 */
const qrTokenSchema = z
  .string({ required_error: "El QR es obligatorio" })
  .trim()
  .min(1, "El QR es obligatorio")
  .max(2048, "El QR no es válido");

/** Sede en el sistema de fidelización. Opcional: por defecto la de entorno. */
const locationIdSchema = z
  .string()
  .trim()
  .min(1, "La sede no puede estar vacía")
  .max(128, "Sede no válida");

/** Código de cupón a canjear. */
const couponCodeSchema = z
  .string()
  .trim()
  .min(1, "El cupón no puede estar vacío")
  .max(128, "Cupón no válido");

/**
 * Precio de un servicio en céntimos enteros: entero, ≥ 0 y con un tope defensivo
 * (100.000,00 €) que descarta importes absurdos sin bloquear ningún caso real.
 */
const priceCentsSchema = z
  .number({ invalid_type_error: "Los precios deben ser números en céntimos" })
  .int("Los precios deben ser enteros de céntimos")
  .min(0, "Los precios no pueden ser negativos")
  .max(100_000_00, "Precio de servicio fuera de rango");

/** Cuerpo de `POST /api/loyalty/lookup`. */
export const loyaltyLookupBodySchema = z.object({
  qr_token: qrTokenSchema,
});

/** Cuerpo de `POST /api/loyalty/verify-visit`. */
export const verifyVisitBodySchema = z.object({
  qr_token: qrTokenSchema,
  /** Sede opcional; si se omite, el servidor usa `LOYALTY_LOCATION_ID`. */
  location_id: locationIdSchema.optional(),
  /** Precios (céntimos) de los servicios de la visita; se acota el número de líneas. */
  service_prices: z
    .array(priceCentsSchema)
    .max(100, "Demasiados servicios en una sola visita"),
  /** Cupón a canjear, o `null`/omitido si ninguno. */
  redeem_coupon: couponCodeSchema.nullish(),
});

/** Cuerpo validado de `lookup`. */
export type LoyaltyLookupBody = z.output<typeof loyaltyLookupBodySchema>;
/** Cuerpo validado de `verify-visit`. */
export type VerifyVisitBody = z.output<typeof verifyVisitBodySchema>;
