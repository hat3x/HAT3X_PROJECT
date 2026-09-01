## Task 2: Sector registry (pure config)

**Files:**
- Create: `src/lib/sector/registry.ts`
- Test: `src/tests/unit/sector-registry.test.ts`

**Interfaces:**
- Consumes: `SalonSector` from `@/types/database`.
- Produces: `SectorTerms`, `SectorConfig`, `SECTOR_REGISTRY: Record<SalonSector, SectorConfig>`, `getSectorConfig(sector)`, `sectorTerms(sector): SectorTerms`, `SECTOR_ORDER: readonly SalonSector[]`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SECTOR_REGISTRY,
  SECTOR_ORDER,
  getSectorConfig,
  sectorTerms,
} from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

const ALL: SalonSector[] = ["peluqueria", "odontologia", "restauracion"];

describe("sector registry", () => {
  it("tiene una config por sector, con clave coherente", () => {
    for (const s of ALL) expect(SECTOR_REGISTRY[s].key).toBe(s);
  });
  it("peluqueria conserva la terminologia actual", () => {
    const t = sectorTerms("peluqueria");
    expect(t.customerPlural).toBe("Clientes");
    expect(t.servicePlural).toBe("Servicios");
    expect(t.professionalPlural).toBe("Personal");
  });
  it("odontologia relabela a Paciente/Tratamiento/Equipo", () => {
    const t = sectorTerms("odontologia");
    expect(t.customer).toBe("Paciente");
    expect(t.customerPlural).toBe("Pacientes");
    expect(t.service).toBe("Tratamiento");
    expect(t.professionalPlural).toBe("Equipo");
  });
  it("implemented: peluqueria y odontologia true, restauracion false", () => {
    expect(SECTOR_REGISTRY.peluqueria.implemented).toBe(true);
    expect(SECTOR_REGISTRY.odontologia.implemented).toBe(true);
    expect(SECTOR_REGISTRY.restauracion.implemented).toBe(false);
  });
  it("SECTOR_ORDER lista los 3 sectores", () => {
    expect([...SECTOR_ORDER].sort()).toEqual([...ALL].sort());
  });
  it("getSectorConfig devuelve la config", () => {
    expect(getSectorConfig("odontologia").brandName).toBe("Clínica OS");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-registry.test.ts`
Expected: FAIL (module `@/lib/sector/registry` not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/sector/registry.ts`:
```ts
/**
 * Registro de sector (config PURA, isomórfica) — molde: `@/lib/salon-feature-flags`.
 * Fuente única de labels transversales, marca por defecto y estado de implementación.
 */
import type { SalonSector } from "@/types/database";

export interface SectorTerms {
  customer: string;
  customerPlural: string;
  service: string;
  servicePlural: string;
  professional: string;
  professionalPlural: string;
}

export interface SectorConfig {
  key: SalonSector;
  label: string;      // nombre del sector para el picker
  brandName: string;  // wordmark de la app en ese sector
  defaultPrimary: string; // #rrggbb; el salon_branding del tenant tiene prioridad
  implemented: boolean;   // false = cascarón "Próximamente"
  terms: SectorTerms;
}

export const SECTOR_REGISTRY: Record<SalonSector, SectorConfig> = {
  peluqueria: {
    key: "peluqueria",
    label: "Peluquería",
    brandName: "Salón OS",
    defaultPrimary: "#7c3aed",
    implemented: true,
    terms: {
      customer: "Cliente", customerPlural: "Clientes",
      service: "Servicio", servicePlural: "Servicios",
      professional: "Profesional", professionalPlural: "Personal",
    },
  },
  odontologia: {
    key: "odontologia",
    label: "Odontología",
    brandName: "Clínica OS",
    defaultPrimary: "#0f766e",
    implemented: true,
    terms: {
      customer: "Paciente", customerPlural: "Pacientes",
      service: "Tratamiento", servicePlural: "Tratamientos",
      professional: "Dentista", professionalPlural: "Equipo",
    },
  },
  restauracion: {
    key: "restauracion",
    label: "Restauración",
    brandName: "Restau OS",
    defaultPrimary: "#c2410c",
    implemented: false,
    terms: {
      customer: "Cliente", customerPlural: "Clientes",
      service: "Producto", servicePlural: "Carta",
      professional: "Empleado", professionalPlural: "Equipo",
    },
  },
};

export const SECTOR_ORDER: readonly SalonSector[] = [
  "peluqueria", "odontologia", "restauracion",
];

export function getSectorConfig(sector: SalonSector): SectorConfig {
  return SECTOR_REGISTRY[sector];
}

export function sectorTerms(sector: SalonSector): SectorTerms {
  return SECTOR_REGISTRY[sector].terms;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-registry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/sector/registry.ts clients/projects/salon-os/src/tests/unit/sector-registry.test.ts
git commit -m "feat(salon-os): sector registry (terminology/brand per sector)"
```

---

