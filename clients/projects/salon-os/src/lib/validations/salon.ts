import { z } from "zod";

import { isValidTimeZone } from "@/lib/booking/timezone";

/**
 * Esquema de validación de los datos generales del salón.
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor) como
 * en el formulario cliente para tipar los valores por defecto. Sigue el mismo
 * patrón que `customerSchema`: los campos de contacto opcionales vacíos se
 * normalizan a `undefined` para que el Server Action los traduzca a `null`.
 *
 * `slug` y `settings` quedan deliberadamente fuera: no se editan aquí.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

export const salonSettingsSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(120, "El nombre no puede superar 120 caracteres"),
  timezone: z
    .string({ required_error: "La zona horaria es obligatoria" })
    .trim()
    .min(1, "La zona horaria es obligatoria")
    .refine(isValidTimeZone, "Zona horaria no válida"),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Email no válido")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === undefined || value === "" ? undefined : value)),
  address: optionalText(255),
});

export type SalonSettingsInput = z.input<typeof salonSettingsSchema>;
export type SalonSettingsValues = z.output<typeof salonSettingsSchema>;
