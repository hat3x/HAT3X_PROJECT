import { describe, it, expect } from "vitest";
import {
  MEDICATION_TEMPLATES,
  PRESCRIPTION_STATUSES,
  PRESCRIPTION_STATUS_LABELS,
  canIssuePrescription,
  canRevokePrescription,
  getMedicationTemplate,
} from "@/lib/dental/prescriptions";

// ---------------------------------------------------------------------------
// Etiquetas de display — definidas para todos los estados
// ---------------------------------------------------------------------------

describe("PRESCRIPTION_STATUS_LABELS", () => {
  it("tiene una etiqueta en español no vacía para cada estado", () => {
    for (const status of PRESCRIPTION_STATUSES) {
      expect(typeof PRESCRIPTION_STATUS_LABELS[status]).toBe("string");
      expect(PRESCRIPTION_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("usa las etiquetas exactas Borrador/Emitida/Revocada", () => {
    expect(PRESCRIPTION_STATUS_LABELS.draft).toBe("Borrador");
    expect(PRESCRIPTION_STATUS_LABELS.issued).toBe("Emitida");
    expect(PRESCRIPTION_STATUS_LABELS.revoked).toBe("Revocada");
  });
});

// ---------------------------------------------------------------------------
// Máquina de estados — espejo del trigger prescription_guard_issued
// ---------------------------------------------------------------------------

describe("canIssuePrescription", () => {
  it("solo permite emitir desde 'draft'", () => {
    expect(canIssuePrescription("draft")).toBe(true);
    expect(canIssuePrescription("issued")).toBe(false);
    expect(canIssuePrescription("revoked")).toBe(false);
  });
});

describe("canRevokePrescription", () => {
  it("solo permite revocar desde 'issued'", () => {
    expect(canRevokePrescription("issued")).toBe(true);
    expect(canRevokePrescription("draft")).toBe(false);
    expect(canRevokePrescription("revoked")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MEDICATION_TEMPLATES / getMedicationTemplate
// ---------------------------------------------------------------------------

describe("MEDICATION_TEMPLATES", () => {
  it("tiene name/dose/frequency/duration no vacíos para cada plantilla", () => {
    expect(MEDICATION_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of MEDICATION_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.dose.length).toBeGreaterThan(0);
      expect(template.frequency.length).toBeGreaterThan(0);
      expect(template.duration.length).toBeGreaterThan(0);
    }
  });

  it("incluye el catálogo dental frecuente esperado", () => {
    const names = MEDICATION_TEMPLATES.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Amoxicilina 500 mg",
        "Amoxicilina/clavulánico 875/125 mg",
        "Ibuprofeno 600 mg",
        "Dexketoprofeno 25 mg",
        "Paracetamol 1 g",
        "Metronidazol 250 mg",
        "Clorhexidina 0,12% colutorio",
        "Omeprazol 20 mg",
      ]),
    );
  });

  it("no tiene nombres duplicados", () => {
    const names = MEDICATION_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getMedicationTemplate", () => {
  it("devuelve la plantilla exacta del catálogo por nombre", () => {
    const template = getMedicationTemplate("Amoxicilina 500 mg");
    expect(template).toEqual({
      name: "Amoxicilina 500 mg",
      dose: "1 comprimido",
      frequency: "cada 8 h",
      duration: "7 días",
    });
  });

  it("devuelve undefined para un nombre fuera del catálogo (medicación libre)", () => {
    expect(getMedicationTemplate("Medicamento inventado")).toBeUndefined();
    expect(getMedicationTemplate("")).toBeUndefined();
  });
});
