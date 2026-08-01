import { describe, it, expect } from "vitest";
import {
  CONSENT_STATUS_LABELS,
  CONSENT_STATUSES,
  CONSENT_TEMPLATES,
  CONSENT_TYPE_LABELS,
  CONSENT_TYPES,
  IMAGE_MODALITIES,
  IMAGE_MODALITY_LABELS,
  canRevokeConsent,
  canSignConsent,
  getConsentTemplate,
  isImageModality,
} from "@/lib/dental/consents";

// ---------------------------------------------------------------------------
// Etiquetas de display — definidas para todos los enums
// ---------------------------------------------------------------------------

describe("CONSENT_TYPE_LABELS", () => {
  it("tiene una etiqueta en español no vacía para cada tipo de consentimiento", () => {
    for (const type of CONSENT_TYPES) {
      expect(typeof CONSENT_TYPE_LABELS[type]).toBe("string");
      expect(CONSENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});

describe("CONSENT_STATUS_LABELS", () => {
  it("tiene una etiqueta en español no vacía para cada estado", () => {
    for (const status of CONSENT_STATUSES) {
      expect(typeof CONSENT_STATUS_LABELS[status]).toBe("string");
      expect(CONSENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("IMAGE_MODALITY_LABELS", () => {
  it("tiene una etiqueta en español no vacía para cada modalidad", () => {
    for (const modality of IMAGE_MODALITIES) {
      expect(typeof IMAGE_MODALITY_LABELS[modality]).toBe("string");
      expect(IMAGE_MODALITY_LABELS[modality].length).toBeGreaterThan(0);
    }
  });
});

describe("isImageModality", () => {
  it("acepta cualquier modalidad del catálogo", () => {
    for (const modality of IMAGE_MODALITIES) {
      expect(isImageModality(modality)).toBe(true);
    }
  });

  it("rechaza un valor arbitrario", () => {
    expect(isImageModality("resonancia_magnetica")).toBe(false);
    expect(isImageModality("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getConsentTemplate / CONSENT_TEMPLATES
// ---------------------------------------------------------------------------

describe("getConsentTemplate", () => {
  it("devuelve título, cuerpo y versión no vacíos para cada tipo", () => {
    for (const type of CONSENT_TYPES) {
      const template = getConsentTemplate(type);
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.body.length).toBeGreaterThan(0);
      expect(template.version.length).toBeGreaterThan(0);
    }
  });

  it("devuelve exactamente la entrada del catálogo CONSENT_TEMPLATES", () => {
    expect(getConsentTemplate("endodoncia")).toBe(CONSENT_TEMPLATES.endodoncia);
    expect(getConsentTemplate("rgpd")).toBe(CONSENT_TEMPLATES.rgpd);
  });

  it("las plantillas usan la versión 'v1' (espejo del default de BD)", () => {
    for (const type of CONSENT_TYPES) {
      expect(getConsentTemplate(type).version).toBe("v1");
    }
  });
});

// ---------------------------------------------------------------------------
// canSignConsent / canRevokeConsent — espejo del trigger consents_guard_signed
// ---------------------------------------------------------------------------

describe("canSignConsent", () => {
  it("solo 'pending' se puede firmar", () => {
    expect(canSignConsent("pending")).toBe(true);
    expect(canSignConsent("signed")).toBe(false);
    expect(canSignConsent("revoked")).toBe(false);
  });
});

describe("canRevokeConsent", () => {
  it("solo 'signed' se puede revocar", () => {
    expect(canRevokeConsent("signed")).toBe(true);
    expect(canRevokeConsent("pending")).toBe(false);
    expect(canRevokeConsent("revoked")).toBe(false);
  });
});
