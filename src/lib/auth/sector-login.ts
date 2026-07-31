/**
 * Guard de sector para el login (pura). Una credencial pertenece a UN tenant y por
 * tanto a UN sector; si el usuario eligió otro sector en el picker, se rechaza con
 * mensaje legible. El aislamiento real lo da la RLS; esto es coherencia de UX.
 */
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

const VALID: readonly SalonSector[] = ["peluqueria", "odontologia", "restauracion"];

export function parseSectorParam(raw: string | null | undefined): SalonSector | null {
  return typeof raw === "string" && (VALID as readonly string[]).includes(raw)
    ? (raw as SalonSector)
    : null;
}

export function sectorMismatchMessage(
  chosen: SalonSector,
  tenant: SalonSector,
): string | null {
  if (chosen === tenant) return null;
  return (
    `Estas credenciales son del sector ${SECTOR_REGISTRY[tenant].label}, ` +
    `no de ${SECTOR_REGISTRY[chosen].label}. Elige el sector correcto para entrar.`
  );
}
