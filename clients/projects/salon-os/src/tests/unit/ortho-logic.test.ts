import { describe, it, expect } from "vitest";

import {
  MALOCCLUSION_CLASS_LABELS,
  APPLIANCE_TYPE_LABELS,
  ORTHO_STATUS_LABELS,
  EMPTY_ORTHO_FICHA,
  EMPTY_ORTHO_TREATMENT,
} from "@/lib/dental/ortho";

describe("ortho label maps", () => {
  it("cubre las 4 clases de maloclusión", () => {
    expect(Object.keys(MALOCCLUSION_CLASS_LABELS)).toHaveLength(4);
    expect(MALOCCLUSION_CLASS_LABELS["II-1"]).toBe("Clase II división 1");
  });

  it("cubre las 4 aparatologías y los 4 estados", () => {
    expect(Object.keys(APPLIANCE_TYPE_LABELS)).toHaveLength(4);
    expect(APPLIANCE_TYPE_LABELS.alineadores).toBe("Alineadores invisibles");
    expect(ORTHO_STATUS_LABELS.retencion).toBe("Retención");
  });

  it("los EMPTY_* tienen todos los campos en null/false", () => {
    expect(EMPTY_ORTHO_FICHA.malocclusionClass).toBeNull();
    expect(EMPTY_ORTHO_FICHA.diastema).toBe(false);
    expect(EMPTY_ORTHO_TREATMENT.status).toBeNull();
  });
});
