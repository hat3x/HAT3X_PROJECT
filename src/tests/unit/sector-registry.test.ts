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
