import { createClient } from "@/lib/supabase/client";

/**
 * Recall de revisión: pacientes con teléfono cuya última cita (cualquier
 * estado, por `starts_at`) es anterior al corte de `monthsSince` meses, o que
 * no tienen NINGUNA cita registrada (nunca han vuelto / recién dados de alta).
 * Ordenados de más urgente (última visita más antigua, o nunca) a menos.
 */
export interface PatientDueForRecall {
  customerId: string;
  fullName: string;
  phone: string;
  /** ISO de la última cita, o `null` si el cliente no tiene ninguna. */
  lastVisitAt: string | null;
}

/** Meses por defecto sin visitar para considerar a un cliente "pendiente de revisión". */
export const DEFAULT_RECALL_MONTHS = 6;

/** Fábrica de claves de caché para TanStack Query (recall), scoped por salón. */
export const recallKeys = {
  all: (salonId: string) => ["recall", salonId] as const,
  due: (salonId: string, monthsSince: number) =>
    [...recallKeys.all(salonId), "due", monthsSince] as const,
};

/**
 * Reduce una lista de citas a la fecha (`starts_at`) MÁS RECIENTE por cliente.
 * Función PURA — testeable sin tocar Supabase.
 */
export function lastVisitPerCustomer(
  appointments: readonly { customer_id: string; starts_at: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const appt of appointments) {
    const current = map.get(appt.customer_id);
    if (current === undefined || appt.starts_at > current) {
      map.set(appt.customer_id, appt.starts_at);
    }
  }
  return map;
}

/**
 * ISO del instante de corte: `now - monthsSince` meses. Función PURA (recibe
 * `now` para testear). Resta el mes en UTC (`setUTCMonth`), NO en hora local:
 * con aritmética local, el cambio de horario de verano entre `now` y el corte
 * (p. ej. agosto → febrero en Europe/Madrid) desplazaría el resultado una hora,
 * haciendo el cálculo dependiente de la zona horaria del proceso que ejecuta
 * el servidor. En UTC no hay DST, así que el resultado es determinista.
 */
export function computeCutoffIso(monthsSince: number, now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - monthsSince);
  return cutoff.toISOString();
}

/**
 * Filtra y ordena los clientes "pendientes de revisión" dado su última visita
 * conocida. Función PURA — recibe los datos ya resueltos (sin Supabase) para
 * poder testearla en aislamiento; `fetchPatientsDueForRecall` es el único
 * caller real, tras resolver `lastVisitPerCustomer` y `computeCutoffIso`.
 */
export function selectPatientsDueForRecall(
  customers: readonly { id: string; full_name: string; phone: string }[],
  lastVisitByCustomer: ReadonlyMap<string, string>,
  cutoffIso: string,
): PatientDueForRecall[] {
  return customers
    .map((c) => ({
      customerId: c.id,
      fullName: c.full_name,
      phone: c.phone,
      lastVisitAt: lastVisitByCustomer.get(c.id) ?? null,
    }))
    .filter((p) => p.lastVisitAt === null || p.lastVisitAt < cutoffIso)
    .sort((a, b) => {
      // Sin ninguna visita ⇒ más urgente, primero.
      if (a.lastVisitAt === null && b.lastVisitAt === null) {
        return a.fullName.localeCompare(b.fullName);
      }
      if (a.lastVisitAt === null) return -1;
      if (b.lastVisitAt === null) return 1;
      return a.lastVisitAt.localeCompare(b.lastVisitAt);
    });
}

/**
 * Pacientes del salón pendientes de recordatorio de revisión: con teléfono, y
 * cuya última cita es anterior al corte de `monthsSince` meses (o sin ninguna
 * cita registrada). Dos consultas acotadas por `salon_id` + reducción en
 * memoria (evita depender de agregación SQL vía el cliente JS de Supabase).
 */
export async function fetchPatientsDueForRecall(
  salonId: string,
  monthsSince: number = DEFAULT_RECALL_MONTHS,
): Promise<PatientDueForRecall[]> {
  const supabase = createClient();

  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("id, full_name, phone")
    .eq("salon_id", salonId)
    .not("phone", "is", null)
    .order("full_name", { ascending: true });

  if (customersError !== null) throw new Error(customersError.message);
  if (customers === null || customers.length === 0) return [];

  const withPhone = customers.filter(
    (c): c is { id: string; full_name: string; phone: string } => c.phone !== null,
  );
  if (withPhone.length === 0) return [];

  const { data: appointments, error: appointmentsError } = await supabase
    .from("appointments")
    .select("customer_id, starts_at")
    .eq("salon_id", salonId);

  if (appointmentsError !== null) throw new Error(appointmentsError.message);

  const lastVisitByCustomer = lastVisitPerCustomer(appointments ?? []);
  const cutoffIso = computeCutoffIso(monthsSince);

  return selectPatientsDueForRecall(withPhone, lastVisitByCustomer, cutoffIso);
}
