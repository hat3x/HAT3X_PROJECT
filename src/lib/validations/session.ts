import { z } from "zod";

/**
 * Esquemas de validación de la sesión de caja (arqueo del TPV) — apertura y
 * cierre de `pos_sessions`.
 *
 * Se usan en los Server Actions (validación de confianza en servidor) y en el
 * cliente para tipar el payload que envía la pantalla de arqueo.
 *
 * Convenciones (coherentes con `@/lib/validations/sale` y el esquema `pos_*`):
 * - Los importes se introducen en **euros** (texto: "50,00" o "50.00") y el
 *   esquema los transforma a **céntimos enteros** (invariante §1.6 del esquema).
 * - El fondo/efectivo contado son no negativos; el descuadre lo calcula el
 *   servidor a partir de los cobros de la sesión (el cliente no lo envía).
 */

/** Euros como texto ("50,00"/"50.00") → céntimos enteros no negativos. */
const euroCents = (field: string) =>
  z
    .string({ required_error: `${field} es obligatorio` })
    .trim()
    .min(1, `${field} es obligatorio`)
    .refine(
      (value) => /^\d+([.,]\d{1,2})?$/.test(value),
      `${field} no válido (p. ej. 50,00)`,
    )
    .transform((value) => Math.round(Number.parseFloat(value.replace(",", ".")) * 100))
    .refine((cents) => cents <= 100_000_000, `${field} es demasiado alto`);

/** Apertura de caja: fondo inicial + nota opcional. */
export const openSessionSchema = z.object({
  /** Fondo de caja inicial (efectivo con el que arranca el cajón). */
  openingFloat: euroCents("El fondo de caja"),
  /** Nota libre de la apertura (turno, cajero, incidencia…). */
  notes: z.string().trim().max(500, "La nota es demasiado larga").optional(),
});

/** Cierre de caja (arqueo): sesión + efectivo contado + nota opcional. */
export const closeSessionSchema = z.object({
  /** Sesión abierta a cerrar. */
  sessionId: z.string().uuid("Sesión no válida"),
  /** Efectivo realmente contado en el cajón al cierre. */
  countedCash: euroCents("El efectivo contado"),
  /** Nota del cierre (justificación del descuadre, incidencias…). */
  notes: z.string().trim().max(500, "La nota es demasiado larga").optional(),
});

/** Tipo de entrada de apertura (importes como texto). */
export type OpenSessionInput = z.input<typeof openSessionSchema>;
/** Tipo de entrada de cierre (importes como texto). */
export type CloseSessionInput = z.input<typeof closeSessionSchema>;
