### Task 1: Dominio ortho (tipos + label maps puros)

**Files:**
- Create: `src/lib/dental/ortho.ts`
- Modify: `src/lib/dental/index.ts` (barrel — añadir `export * from "./ortho";`)
- Test: `src/tests/unit/ortho-logic.test.ts`

**Interfaces:**
- Produces: tipos `MalocclusionClass`, `CrowdingLevel`, `Crossbite`, `ApplianceType`, `OrthoArch`, `OrthoStatus`, `OrthoFicha`, `OrthoTreatment`, `OrthoData`, `OrthoVisitActions`; constantes `EMPTY_ORTHO_FICHA`, `EMPTY_ORTHO_TREATMENT`; label maps `MALOCCLUSION_CLASS_LABELS`, `CROWDING_LEVEL_LABELS`, `CROSSBITE_LABELS`, `APPLIANCE_TYPE_LABELS`, `ORTHO_ARCH_LABELS`, `ORTHO_STATUS_LABELS`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-logic.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-logic.test.ts`
Expected: FAIL — cannot find module `@/lib/dental/ortho`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dental/ortho.ts
/** Dominio de ortodoncia (Fase 1): tipos, valores por defecto y etiquetas ES. Puro, sin IO. */

export type MalocclusionClass = "I" | "II-1" | "II-2" | "III";
export type CrowdingLevel = "ninguno" | "leve" | "moderado" | "severo";
export type Crossbite = "ninguna" | "anterior" | "posterior";
export type ApplianceType =
  | "brackets_metalicos"
  | "brackets_esteticos"
  | "alineadores"
  | "ortopedia";
export type OrthoArch = "superior" | "inferior" | "ambas";
export type OrthoStatus = "activo" | "retencion" | "finalizado" | "cancelado";

export interface OrthoFicha {
  malocclusionClass: MalocclusionClass | null;
  crowdingUpper: CrowdingLevel | null;
  crowdingLower: CrowdingLevel | null;
  diastema: boolean;
  diastemaNote: string | null;
  crossbite: Crossbite | null;
  overjetMm: number | null;
  overbiteMm: number | null;
  openBite: boolean;
  diagnosisNotes: string | null;
}

export interface OrthoTreatment {
  applianceType: ApplianceType | null;
  arch: OrthoArch | null;
  estimatedMonths: number | null;
  startDate: string | null; // ISO "YYYY-MM-DD"
  status: OrthoStatus | null;
  objectives: string | null;
}

export interface OrthoData {
  ficha: OrthoFicha;
  treatment: OrthoTreatment;
}

export interface OrthoVisitActions {
  wireChange: boolean;
  wireDetail: string | null;
  ligatures: boolean;
  elastics: boolean;
  elasticsDetail: string | null;
  alignerDelivered: number | null;
}

export const EMPTY_ORTHO_FICHA: OrthoFicha = {
  malocclusionClass: null,
  crowdingUpper: null,
  crowdingLower: null,
  diastema: false,
  diastemaNote: null,
  crossbite: null,
  overjetMm: null,
  overbiteMm: null,
  openBite: false,
  diagnosisNotes: null,
};

export const EMPTY_ORTHO_TREATMENT: OrthoTreatment = {
  applianceType: null,
  arch: null,
  estimatedMonths: null,
  startDate: null,
  status: null,
  objectives: null,
};

export const MALOCCLUSION_CLASS_LABELS: Record<MalocclusionClass, string> = {
  I: "Clase I",
  "II-1": "Clase II división 1",
  "II-2": "Clase II división 2",
  III: "Clase III",
};

export const CROWDING_LEVEL_LABELS: Record<CrowdingLevel, string> = {
  ninguno: "Ninguno",
  leve: "Leve",
  moderado: "Moderado",
  severo: "Severo",
};

export const CROSSBITE_LABELS: Record<Crossbite, string> = {
  ninguna: "Ninguna",
  anterior: "Anterior",
  posterior: "Posterior",
};

export const APPLIANCE_TYPE_LABELS: Record<ApplianceType, string> = {
  brackets_metalicos: "Brackets metálicos",
  brackets_esteticos: "Brackets estéticos",
  alineadores: "Alineadores invisibles",
  ortopedia: "Ortopedia",
};

export const ORTHO_ARCH_LABELS: Record<OrthoArch, string> = {
  superior: "Superior",
  inferior: "Inferior",
  ambas: "Ambas",
};

export const ORTHO_STATUS_LABELS: Record<OrthoStatus, string> = {
  activo: "Activo",
  retencion: "Retención",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};
```

Luego añade a `src/lib/dental/index.ts` (una línea, conservando los exports existentes):

```ts
export * from "./ortho";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-logic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dental/ortho.ts src/lib/dental/index.ts src/tests/unit/ortho-logic.test.ts
git commit -m "feat(ortodoncia): dominio ortho (tipos + label maps)"
```

---

