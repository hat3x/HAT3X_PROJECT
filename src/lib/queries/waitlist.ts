import type { WaitlistCandidate } from "@/lib/booking/waitlist";
import { createClient } from "@/lib/supabase/client";
import type { WaitlistEntry } from "@/types/database";

/**
 * Lista de espera — lectura (B3).
 *
 * Se traen SIEMPRE el nombre y el teléfono del cliente en la misma consulta: la
 * lista existe para llamar a alguien, y una lista de identificadores sin
 * teléfono no sirve para eso.
 */

export interface WaitlistEntryWithCustomer extends WaitlistEntry {
  customer: { id: string; full_name: string; phone: string | null } | null;
}

export const waitlistKeys = {
  all: (salonId: string) => ["waitlist", salonId] as const,
  list: (salonId: string) => [...waitlistKeys.all(salonId), "list"] as const,
  live: (salonId: string) => [...waitlistKeys.all(salonId), "live"] as const,
};

const SELECT = "*, customer:customers(id, full_name, phone)";

/** Toda la lista del salón, por prioridad y luego por antigüedad. */
export async function fetchWaitlist(salonId: string): Promise<WaitlistEntryWithCustomer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("waitlist_entry")
    .select(SELECT)
    .eq("salon_id", salonId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return (data ?? []) as unknown as WaitlistEntryWithCustomer[];
}

/**
 * Solo las entradas VIVAS: las que tiene sentido considerar cuando queda un
 * hueco. Es la consulta que respalda el índice parcial de la migración.
 */
export async function fetchLiveWaitlist(salonId: string): Promise<WaitlistEntryWithCustomer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("waitlist_entry")
    .select(SELECT)
    .eq("salon_id", salonId)
    .in("status", ["esperando", "avisado"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return (data ?? []) as unknown as WaitlistEntryWithCustomer[];
}

/**
 * Adapta una fila a lo que espera `matchWaitlist`.
 *
 * La traducción vive aquí, en el borde, para que el motor de emparejamiento no
 * sepa nada de Supabase y se pueda probar entero sin base de datos.
 */
export function toCandidate(entry: WaitlistEntryWithCustomer): WaitlistCandidate {
  return {
    id: entry.id,
    customerId: entry.customer_id,
    serviceId: entry.service_id,
    professionalId: entry.professional_id,
    weekdays: entry.weekdays,
    fromTime: entry.from_time,
    toTime: entry.to_time,
    priority: entry.priority,
    createdAt: entry.created_at,
    expiresAt: entry.expires_at,
  };
}
