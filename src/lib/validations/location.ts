import { z } from "zod";

/**
 * Esquema de validación de una sede (location).
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor)
 * como en el formulario cliente para tipar los valores por defecto.
 *
 * El `slug` es único por salón (constraint `unique (salon_id, slug)` en la
 * base) y debe cumplir el mismo patrón que exige la columna:
 * `^[a-z0-9]+(-[a-z0-9]+)*$` (minúsculas, dígitos y guiones simples).
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

/** Patrón de slug admitido por la columna `locations.slug`. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Convierte un texto libre en un slug válido: minúsculas, sin acentos,
 * espacios y símbolos colapsados a guiones simples. Se usa para autocompletar
 * el slug a partir del nombre de la sede.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // elimina diacríticos (á → a)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // no alfanuméricos → guión
    .replace(/^-+|-+$/g, ""); // recorta guiones sobrantes en los extremos
}

export const locationSchema = z.object({
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "El nombre no puede superar 200 caracteres"),
  slug: z
    .string({ required_error: "El identificador es obligatorio" })
    .trim()
    .min(1, "El identificador es obligatorio")
    .max(100, "El identificador no puede superar 100 caracteres")
    .regex(
      SLUG_PATTERN,
      "Usa solo minúsculas, números y guiones (p. ej. collado-villalba)",
    ),
  address: optionalText(500),
  phone: optionalText(30),
});

export type LocationInput = z.input<typeof locationSchema>;
export type LocationValues = z.output<typeof locationSchema>;
