import { z } from "zod";

/**
 * Esquema de validación de una venta de caja (TPV) — "pasar por caja".
 *
 * Se usa en el Server Action (validación de confianza en servidor) y en el
 * cliente para tipar el payload que envía la pantalla de caja.
 *
 * Convenciones (coherentes con `@/lib/payments` y con el esquema `pos_*`):
 * - Los importes se introducen en **euros** (texto: "12,50" o "12.50") y el
 *   esquema los transforma a **céntimos enteros** (invariante §1.6 del esquema).
 * - Los precios unitarios son **BRUTO (PVP, IVA incluido)**: la base y la cuota
 *   se extraen del bruto en la capa de pagos, nunca aquí.
 * - El servidor **recalcula** los totales a partir de las líneas; el cliente no
 *   envía totales (no se confía en ellos).
 */

/** Euros como texto ("12,50"/"12.50") → céntimos enteros. Acepta 0. */
const euroCents = (field: string) =>
  z
    .string({ required_error: `${field} es obligatorio` })
    .trim()
    .min(1, `${field} es obligatorio`)
    .refine(
      (value) => /^\d+([.,]\d{1,2})?$/.test(value),
      `${field} no válido (p. ej. 12,50)`,
    )
    .transform((value) => Math.round(Number.parseFloat(value.replace(",", ".")) * 100))
    .refine((cents) => cents <= 100_000_000, `${field} es demasiado alto`);

/** Tipo base del medio de pago (enum `pos_payment_method`). */
export const paymentMethodEnum = z.enum([
  "efectivo",
  "tarjeta",
  "bizum",
  "transferencia",
  "otro",
]);

/** Una línea del ticket: servicio, producto o concepto manual. */
export const saleLineSchema = z.object({
  /** Naturaleza de la línea (determina a qué catálogo apunta). */
  kind: z.enum(["service", "product", "manual"]),
  /** id del servicio/producto de origen; `null` en líneas manuales. */
  refId: z.string().uuid().nullable(),
  /** Descripción visible (snapshot; se persiste en `description`). */
  description: z
    .string({ required_error: "La descripción es obligatoria" })
    .trim()
    .min(1, "La descripción es obligatoria")
    .max(200, "La descripción no puede superar 200 caracteres"),
  /** Cantidad (admite fracciones, p. ej. venta por peso). Debe ser > 0. */
  quantity: z
    .string({ required_error: "La cantidad es obligatoria" })
    .trim()
    .refine((value) => /^\d+([.,]\d{1,3})?$/.test(value), "Cantidad no válida")
    .transform((value) => Number.parseFloat(value.replace(",", ".")))
    .refine((qty) => qty > 0, "La cantidad debe ser mayor que 0"),
  /** Precio unitario BRUTO en euros → céntimos. */
  unitPrice: euroCents("El precio"),
  /** Tipo de IVA en porcentaje (21, 10, 4, 0…). Llega como texto del <Select>. */
  vatRate: z
    .string({ required_error: "Selecciona un tipo de IVA" })
    .trim()
    .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value), "Tipo de IVA no válido")
    .transform((value) => Number.parseFloat(value.replace(",", ".")))
    .refine((rate) => rate >= 0 && rate <= 100, "Tipo de IVA no válido"),
});

/**
 * Cupón de bienvenida aplicado al ticket. El cliente envía SOLO las referencias
 * (`id` del cupón + `customerId` a quien pertenece), NUNCA el porcentaje: el
 * servidor re-resuelve el `percent_off` autoritativo y comprueba que el cupón
 * sigue vigente antes de descontar (ver `resolveActiveCouponPercentOff`).
 */
export const saleCouponSchema = z.object({
  /** id del cupón de bienvenida escaneado. */
  id: z.string().uuid(),
  /** Cliente dueño del cupón (el escaneado por QR en el TPV). */
  customerId: z.string().uuid(),
});

/** Un medio de pago aplicado a la venta. Varios tenders = pago mixto. */
export const tenderSchema = z.object({
  method: paymentMethodEnum,
  /** Importe aplicado en euros → céntimos. */
  amount: euroCents("El importe"),
  /** Método concreto del catálogo del salón (opcional, para informes). */
  paymentMethodId: z.string().uuid().nullable().optional(),
  /** Referencia externa (autorización tarjeta, id Bizum…). */
  reference: z.string().trim().max(120).optional(),
});

/** Payload completo de una venta a registrar en caja. */
export const saleSchema = z.object({
  /** Cita de origen (venta "desde cita"); `null` en venta libre. */
  appointmentId: z.string().uuid().nullable().optional(),
  /** Cliente asociado (opcional en venta libre / a cuenta anónima). */
  customerId: z.string().uuid().nullable().optional(),
  /** Profesional que atiende / vende (opcional). */
  professionalId: z.string().uuid().nullable().optional(),
  /** Nota libre del ticket. */
  notes: z.string().trim().max(500).optional(),
  /** Cupón de bienvenida aplicado (opcional); el servidor valida su vigencia. */
  coupon: saleCouponSchema.nullable().optional(),
  /**
   * Cliente ESCANEADO por QR al que acreditar la visita de fidelización tras el
   * cobro. Es independiente de `customerId` (que puede venir de la cita): la
   * fidelización SIEMPRE se acredita al cliente escaneado en el TPV. Ausente/`null`
   * ⇒ no se escaneó a nadie y no se acredita ninguna visita (aditivo: la caja se
   * comporta igual que sin fidelización).
   */
  loyaltyCustomerId: z.string().uuid().nullable().optional(),
  /** Al menos una línea; el ticket vacío no se cobra. */
  lines: z.array(saleLineSchema).min(1, "Añade al menos una línea al ticket"),
  /** Al menos un medio de pago; deben cubrir exactamente el total. */
  tenders: z.array(tenderSchema).min(1, "Selecciona al menos un medio de pago"),
});

/** Tipo de entrada (lo que envía el cliente, con importes como texto). */
export type SaleInput = z.input<typeof saleSchema>;
/** Tipo de salida (validado, con importes en céntimos). */
export type SaleValues = z.output<typeof saleSchema>;
/** Una línea validada (importes en céntimos). */
export type SaleLineValues = z.output<typeof saleLineSchema>;
