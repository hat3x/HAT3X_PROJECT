/**
 * Lógica pura de recetas/prescripciones (odontología).
 *
 * Espejo conceptual de `consents.ts`: sin IO, solo etiquetas de display, el
 * catálogo de plantillas de medicación (español) y los guards de la pequeña
 * máquina de estados de `prescription.status` (`draft → issued → revoked`),
 * que ESPEJA el trigger `prescription_guard_issued` de la migración
 * `20260801140000_prescriptions.sql`:
 *   - `draft` es el único estado desde el que se puede EMITIR.
 *   - `issued` es el único estado desde el que se puede REVOCAR.
 *   - `revoked` es terminal (inmutable en BD).
 */
import type { PrescriptionStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Catálogo de valores (para tests e iteración exhaustiva)
// ---------------------------------------------------------------------------

export const PRESCRIPTION_STATUSES: readonly PrescriptionStatus[] = ["draft", "issued", "revoked"];

// ---------------------------------------------------------------------------
// Etiquetas de display (español)
// ---------------------------------------------------------------------------

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  draft: "Borrador",
  issued: "Emitida",
  revoked: "Revocada",
};

// ---------------------------------------------------------------------------
// Catálogo de plantillas de medicación dental frecuente (español)
// ---------------------------------------------------------------------------

/** Plantilla de un medicamento frecuente: dosis/pauta/duración por defecto. */
export interface MedicationTemplate {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
}

/**
 * Catálogo de medicación dental de uso frecuente (antibióticos, analgésicos/
 * antiinflamatorios, antisépticos, protectores gástricos). Sirve de contenido
 * POR DEFECTO al añadir un renglón de receta (`prescription_item`): el
 * profesional puede sustituirlo por texto libre en `medication`/`dose`/
 * `frequency`/`duration`.
 */
export const MEDICATION_TEMPLATES: readonly MedicationTemplate[] = [
  {
    name: "Amoxicilina 500 mg",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "7 días",
  },
  {
    name: "Amoxicilina/clavulánico 875/125 mg",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "7 días",
  },
  {
    name: "Ibuprofeno 600 mg",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "5 días",
  },
  {
    name: "Dexketoprofeno 25 mg",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "5 días",
  },
  {
    name: "Paracetamol 1 g",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "5 días",
  },
  {
    name: "Metronidazol 250 mg",
    dose: "1 comprimido",
    frequency: "cada 8 h",
    duration: "7 días",
  },
  {
    name: "Clorhexidina 0,12% colutorio",
    dose: "15 ml",
    frequency: "2 veces al día",
    duration: "14 días",
  },
  {
    name: "Omeprazol 20 mg",
    dose: "1 cápsula",
    frequency: "cada 24 h",
    duration: "mientras dure el tratamiento",
  },
];

/**
 * Devuelve la plantilla de medicación cuyo `name` coincide EXACTAMENTE con
 * `name`, o `undefined` si no está en el catálogo (medicación de texto libre,
 * fuera de `MEDICATION_TEMPLATES`).
 */
export function getMedicationTemplate(name: string): MedicationTemplate | undefined {
  return MEDICATION_TEMPLATES.find((template) => template.name === name);
}

// ---------------------------------------------------------------------------
// Máquina de estados de prescription.status (espejo del trigger de BD)
// ---------------------------------------------------------------------------

/** `true` si una receta en `status` se puede EMITIR (solo `draft`). */
export function canIssuePrescription(status: PrescriptionStatus): boolean {
  return status === "draft";
}

/** `true` si una receta en `status` se puede REVOCAR (solo `issued`). */
export function canRevokePrescription(status: PrescriptionStatus): boolean {
  return status === "issued";
}
