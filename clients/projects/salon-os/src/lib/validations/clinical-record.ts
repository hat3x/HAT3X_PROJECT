import { z } from "zod";

/**
 * Helper: string normalizado → undefined si vacío (se almacena como null en DB).
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v));

/**
 * Esquema de la ficha clínica (clinical_records).
 *
 * Los campos array los maneja el formulario como string[] (tags).
 */
export const clinicalRecordSchema = z.object({
  allergies: z.array(z.string().trim().min(1)).default([]),
  contraindications: z.array(z.string().trim().min(1)).default([]),
  medications: z.array(z.string().trim().min(1)).default([]),
  skin_hair_type: optionalText(200),
  medical_notes: optionalText(4000),
});

export type ClinicalRecordInput = z.input<typeof clinicalRecordSchema>;
export type ClinicalRecordValues = z.output<typeof clinicalRecordSchema>;
