import { createClient } from "@/lib/supabase/client";
import type { SalonImagingDevice } from "@/types/database";

/**
 * Equipos de captura de imagen del salón (A1a).
 *
 * Lectura por RLS (`members_select_salon_imaging_device`): cualquier miembro los
 * ve, porque quien captura es el personal clínico. Escribir es otra cosa y va
 * por server action con gate de owner/manager.
 */

export const imagingDeviceKeys = {
  all: (salonId: string) => ["imaging-devices", salonId] as const,
  list: (salonId: string) => [...imagingDeviceKeys.all(salonId), "list"] as const,
  usable: (salonId: string) => [...imagingDeviceKeys.all(salonId), "usable"] as const,
  agent: (salonId: string) => [...imagingDeviceKeys.all(salonId), "agent"] as const,
};

/** Emparejamiento con el agente instalado en la clínica. */
export interface ImagingAgentSettings {
  port: number;
  pairingToken: string;
}

/** Puerto por defecto, el mismo que trae el agente de fábrica. */
export const DEFAULT_AGENT_PORT = 7345;

/**
 * Lee el emparejamiento del salón de `salons.settings->imaging_agent`.
 *
 * `null` cuando todavía no se ha emparejado ningún agente, que es el estado de
 * casi todas las clínicas: la pantalla lo trata como «aún no configurado», no
 * como un error.
 */
export async function fetchImagingAgentSettings(
  salonId: string,
): Promise<ImagingAgentSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("salons")
    .select("settings")
    .eq("id", salonId)
    .maybeSingle();

  if (error !== null) throw new Error(error.message);

  const settings = data?.settings as Record<string, unknown> | null | undefined;
  const agent = settings?.imaging_agent as Record<string, unknown> | undefined;
  if (agent === undefined) return null;

  const token = typeof agent.pairing_token === "string" ? agent.pairing_token : "";
  if (token === "") return null;

  return {
    port: typeof agent.port === "number" ? agent.port : DEFAULT_AGENT_PORT,
    pairingToken: token,
  };
}

/** Todos los equipos del salón: activos primero, luego por nombre. */
export async function fetchImagingDevices(salonId: string): Promise<SalonImagingDevice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("salon_imaging_device")
    .select("*")
    .eq("salon_id", salonId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/**
 * Solo los equipos utilizables, que es lo que ofrece el selector de captura con
 * el paciente delante. Un equipo desactivado sigue en ajustes —para no perder su
 * configuración— pero no debe aparecer ahí.
 */
export async function fetchUsableImagingDevices(
  salonId: string,
): Promise<SalonImagingDevice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("salon_imaging_device")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
