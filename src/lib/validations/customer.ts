import { z } from "zod";

/**
 * Esquema de validación de la ficha de cliente.
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor)
 * como en el formulario cliente para tipar los valores por defecto.
 *
 * Los campos opcionales vacíos se normalizan a `undefined` para que el
 * Server Action los traduzca a `null` en la base de datos.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

export const customerSchema = z.object({
  full_name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(120, "El nombre no puede superar 120 caracteres"),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Email no válido")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === undefined || value === "" ? undefined : value)),
  phone: optionalText(40),
  birth_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida (AAAA-MM-DD)")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === undefined || value === "" ? undefined : value)),
  notes: optionalText(2000),
  marketing_consent: z.boolean().default(false),
  // Datos fiscales opcionales — solo necesarios para emitir factura completa
  // nominativa. El ticket simplificado no los requiere.
  tax_id: optionalText(20),
  address: optionalText(1000),
});

export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerValues = z.output<typeof customerSchema>;
