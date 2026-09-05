import { z } from "zod";

/**
 * Esquema de validación de un servicio del catálogo.
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor) como
 * en el formulario cliente para tipar los valores por defecto.
 *
 * Modelo de duración por 3 fases:
 * - `application_min`  → obligatorio, entero ≥ 1 (tiempo de aplicación).
 * - `exposure_min`     → opcional, entero ≥ 0 (default 0).
 * - `post_exposure_min`→ opcional, entero ≥ 0 (default 0).
 *
 * `duration_minutes_total` es una columna **generada** en la base de datos
 * (suma de las tres fases), por lo que no se envía en el payload: se calcula
 * en vivo en el formulario solo con fines informativos.
 *
 * El precio se introduce en **euros** y se transforma a **céntimos**
 * (`price_cents`) para persistirlo como entero, evitando errores de coma
 * flotante.
 */

/** Texto opcional que normaliza cadena vacía a `undefined` (→ `null` en BD). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

/** Fase obligatoria: entero ≥ 1 minuto. Acepta la cadena del formulario. */
const requiredMinutes = z
  .string({ required_error: "El tiempo de aplicación es obligatorio" })
  .trim()
  .min(1, "El tiempo de aplicación es obligatorio")
  .regex(/^\d+$/, "Introduce un número entero de minutos")
  .transform((value) => Number.parseInt(value, 10))
  .refine((value) => value >= 1, "El tiempo de aplicación debe ser al menos 1 minuto");

/** Fase opcional: vacío → 0; en otro caso entero ≥ 0 minutos. */
const optionalMinutes = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === "" ? "0" : value))
    .refine((value) => /^\d+$/.test(value), `${label} debe ser un número entero de minutos`)
    .transform((value) => Number.parseInt(value, 10));

/** Precio en euros (con coma o punto, hasta 2 decimales) → céntimos. */
const priceInCents = z
  .string({ required_error: "El precio es obligatorio" })
  .trim()
  .min(1, "El precio es obligatorio")
  .transform((value) => value.replace(",", "."))
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value),
    "Precio no válido (usa hasta 2 decimales)",
  )
  .refine((value) => Number.parseFloat(value) <= 100000, "El precio es demasiado alto")
  .transform((value) => Math.round(Number.parseFloat(value) * 100));

export const serviceSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(120, "El nombre no puede superar 120 caracteres"),
  category: optionalText(80),
  description: optionalText(2000),
  application_min: requiredMinutes,
  exposure_min: optionalMinutes("El tiempo de exposición"),
  post_exposure_min: optionalMinutes("El tiempo posterior"),
  /** Se introduce en euros; el output ya está en céntimos (`price_cents`). */
  price: priceInCents,
  active: z.boolean().default(true),
});

/** Valores de entrada (lo que envía el formulario: cadenas + booleano). */
export type ServiceInput = z.input<typeof serviceSchema>;
/** Valores ya validados y transformados (minutos y céntimos como enteros). */
export type ServiceValues = z.output<typeof serviceSchema>;
