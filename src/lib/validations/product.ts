import { z } from "zod";

/**
 * Esquema de validación del catálogo de productos.
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor)
 * como en el formulario cliente para tipar los valores por defecto.
 *
 * Convenciones:
 * - `price` se introduce en euros (texto: "12,50" o "12.50") y el esquema lo
 *   transforma a céntimos enteros, que es como lo persiste la base de datos
 *   (`price_cents`).
 * - `stock` es opcional: la cadena vacía representa "producto no inventariado"
 *   y se traduce a `null`.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

export const productSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(120, "El nombre no puede superar 120 caracteres"),
  description: optionalText(2000),
  // Precio en euros → céntimos. Acepta coma o punto decimal (uso español).
  price: z
    .string({ required_error: "El precio es obligatorio" })
    .trim()
    .min(1, "El precio es obligatorio")
    .refine(
      (value) => /^\d+([.,]\d{1,2})?$/.test(value),
      "Precio no válido (p. ej. 12,50)",
    )
    .transform((value) => Math.round(Number.parseFloat(value.replace(",", ".")) * 100))
    .refine((cents) => cents <= 100_000_000, "El precio es demasiado alto"),
  // Tipo de IVA en porcentaje (0, 4, 10, 21…). Llega como texto del <Select>.
  vat_rate: z
    .string({ required_error: "Selecciona un tipo de IVA" })
    .trim()
    .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value), "Tipo de IVA no válido")
    .transform((value) => Number.parseFloat(value.replace(",", ".")))
    .refine((rate) => rate >= 0 && rate <= 100, "Tipo de IVA no válido"),
  // Stock opcional: "" → null (no inventariado); dígitos → entero ≥ 0.
  stock: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "El stock debe ser un número entero",
    )
    .transform((value) => (value === "" ? null : Number.parseInt(value, 10))),
  active: z.boolean().default(true),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductValues = z.output<typeof productSchema>;
