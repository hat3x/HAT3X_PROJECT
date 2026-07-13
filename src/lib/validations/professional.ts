import { z } from "zod";

/**
 * Esquema de validación de un profesional (personal del salón).
 *
 * Se usa tanto en el Server Action (validación de confianza en servidor) como
 * en el formulario cliente para tipar los valores por defecto.
 *
 * Reglas de dominio:
 * - `location_id` → obligatorio: cada profesional pertenece a **una** sede. La
 *   pertenencia de la sede al salón se revalida en el Server Action y, en
 *   última instancia, la impone el FK compuesto `(location_id, salon_id)`.
 * - `color` → color de agenda en formato hex `#RRGGBB` (la columna exige el
 *   patrón `^#[0-9a-fA-F]{6}$`).
 * - `specialties` → texto libre separado por comas → `string[]`.
 * - `service_ids` → relación N:M con `services`: qué servicios presta el
 *   profesional. Cada id se revalida contra el salón en el Server Action.
 */

/** Patrón de color hex de 6 dígitos admitido por la columna `professionals.color`. */
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Paleta por defecto para asignar un color de agenda a un profesional nuevo. */
export const AGENDA_COLORS: readonly string[] = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
];

/** Texto opcional que normaliza cadena vacía a `undefined` (→ `null` en BD). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

/** Email opcional; vacío → `undefined`; en otro caso debe tener formato válido. */
const optionalEmail = z
  .string()
  .trim()
  .max(255, "El email no puede superar 255 caracteres")
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value))
  .refine(
    (value) => value === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Introduce un email válido",
  );

/** Texto de especialidades separado por comas → lista de etiquetas sin vacíos. */
const specialtiesList = z
  .string()
  .trim()
  .max(500, "Las especialidades no pueden superar 500 caracteres")
  .optional()
  .transform((value) =>
    value === undefined || value === ""
      ? []
      : value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== ""),
  );

export const professionalSchema = z.object({
  full_name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(200, "El nombre no puede superar 200 caracteres"),
  email: optionalEmail,
  phone: optionalText(30),
  location_id: z
    .string({ required_error: "Selecciona una sede" })
    .trim()
    .uuid("Selecciona una sede válida"),
  color: z
    .string({ required_error: "Elige un color de agenda" })
    .trim()
    .regex(COLOR_PATTERN, "El color debe estar en formato #RRGGBB"),
  specialties: specialtiesList,
  /** Ids de los servicios que presta el profesional (relación N:M). */
  service_ids: z
    .array(z.string().uuid("Servicio no válido"))
    .default([]),
  active: z.boolean().default(true),
});

/** Valores de entrada (lo que envía el formulario). */
export type ProfessionalInput = z.input<typeof professionalSchema>;
/** Valores ya validados y transformados (specialties como `string[]`). */
export type ProfessionalValues = z.output<typeof professionalSchema>;
