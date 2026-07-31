"use server";

/**
 * Server action del login: resuelve el sector del TENANT del usuario ya
 * autenticado (vía cookies de sesión), para que el cliente pueda comparar
 * contra el sector elegido en el picker sin exponer lógica de Supabase.
 */
import { getActiveSalonSector } from "@/lib/salon";
import type { SalonSector } from "@/types/database";

export async function resolveTenantSector(): Promise<SalonSector | null> {
  return getActiveSalonSector();
}
