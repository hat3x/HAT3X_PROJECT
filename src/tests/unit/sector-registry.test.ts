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
  it("business/businessCapitalized por sector", () => {
    expect(sectorTerms("peluqueria").business).toBe("salón");
    expect(sectorTerms("peluqueria").businessCapitalized).toBe("Salón");
    expect(sectorTerms("odontologia").business).toBe("clínica");
    expect(sectorTerms("odontologia").businessCapitalized).toBe("Clínica");
    expect(sectorTerms("restauracion").business).toBe("restaurante");
    expect(sectorTerms("restauracion").businessCapitalized).toBe("Restaurante");
  });
  it("sampleService por sector, para el preview de marca", () => {
    expect(SECTOR_REGISTRY.peluqueria.sampleService).toEqual({
      name: "Corte y peinado",
      priceCents: 2500,
    });
    expect(SECTOR_REGISTRY.odontologia.sampleService).toEqual({
      name: "Limpieza dental",
      priceCents: 4500,
    });
    expect(SECTOR_REGISTRY.restauracion.sampleService).toEqual({
      name: "Menú del día",
      priceCents: 1500,
    });
  });
  it("implemented: peluqueria, odontologia y restauracion true", () => {
    expect(SECTOR_REGISTRY.peluqueria.implemented).toBe(true);
    expect(SECTOR_REGISTRY.odontologia.implemented).toBe(true);
    expect(SECTOR_REGISTRY.restauracion.implemented).toBe(true);
  });
  it("SECTOR_ORDER lista los 3 sectores", () => {
    expect([...SECTOR_ORDER].sort()).toEqual([...ALL].sort());
  });
  it("getSectorConfig devuelve la config", () => {
    expect(getSectorConfig("odontologia").label).toBe("Odontología");
  });
  it("el masterbrand es «Kairos» en todos los sectores", () => {
    for (const s of ALL) expect(SECTOR_REGISTRY[s].brandName).toBe("Kairos");
  });
});
