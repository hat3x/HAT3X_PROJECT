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
