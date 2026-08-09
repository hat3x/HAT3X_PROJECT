import { createClient } from "@/lib/supabase/client";
import { zonedWallTimeToUtc } from "@/lib/booking/timezone";
import type { Appointment, Professional, Service } from "@/types/database";

/** Appointment enriquecida con cliente, profesional y servicio. */
export type AppointmentWithDetails = Appointment & {
  customer: { full_name: string; phone: string | null; email: string | null } | null;
  professional: { full_name: string; color: string | null } | null;
  service: { name: string; duration_minutes: number } | null;
};

/**
 * Citas del salón para un día local (convertido a UTC).
 * Opcional: filtrar por profesional.
 */
export async function fetchAppointments(
  salonId: string,
  date: string,
  timezone: string,
  professionalId: string | null = null,
): Promise<AppointmentWithDetails[]> {
  const supabase = createClient();

  const start = zonedWallTimeToUtc(date, "00:00", timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  let query = supabase
    .from("appointments")
    .select(
      "*, customer:customers(full_name, phone, email), professional:professionals(full_name, color), service:services(name, duration_minutes)",
    )
    .eq("salon_id", salonId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (professionalId !== null) {
    query = query.eq("professional_id", professionalId);
  }

  const { data, error } = await query;
  if (error !== null) throw new Error(error.message);
  return (data ?? []) as AppointmentWithDetails[];
}

/**
 * Citas del salón en un rango de días locales [startDate, endDateExclusive)
 * (ambos "YYYY-MM-DD", el fin es exclusivo), convertidos a UTC. Para las vistas
 * de calendario (semana / mes / año) del panel de citas.
 */
export async function fetchAppointmentsRange(
  salonId: string,
  startDate: string,
  endDateExclusive: string,
  timezone: string,
): Promise<AppointmentWithDetails[]> {
  const supabase = createClient();

  const start = zonedWallTimeToUtc(startDate, "00:00", timezone);
  const end = zonedWallTimeToUtc(endDateExclusive, "00:00", timezone);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "*, customer:customers(full_name, phone, email), professional:professionals(full_name, color), service:services(name, duration_minutes)",
    )
    .eq("salon_id", salonId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return (data ?? []) as AppointmentWithDetails[];
}

/** Catálogo de servicios activos del salón (para el formulario de creación). */
export async function fetchServicesForDashboard(salonId: string): Promise<Service[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Profesionales activos del salón (para filtro y formulario). */
export async function fetchProfessionalsForDashboard(salonId: string): Promise<Professional[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("professionals")
    .select("*")
    .eq("salon_id", salonId)
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Mapa serviceId → [professionalId, ...] que lo presta. */
export async function fetchServiceProfessionalsMap(
  salonId: string,
): Promise<Record<string, string[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("professional_services")
    .select("service_id, professional_id")
    .eq("salon_id", salonId);

  if (error !== null) throw new Error(error.message);
  const result: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (result[row.service_id] ??= []).push(row.professional_id);
  }
  return result;
}

/** Factoría de query keys para citas (scoped por salonId). */
export const appointmentKeys = {
  all: (salonId: string) => ["appointments", salonId] as const,
  list: (salonId: string, date: string, professionalId: string | null) =>
    [...appointmentKeys.all(salonId), "list", date, professionalId ?? "all"] as const,
  range: (salonId: string, start: string, end: string) =>
    [...appointmentKeys.all(salonId), "range", start, end] as const,
  services: (salonId: string) => ["appt-services", salonId] as const,
  professionals: (salonId: string) => ["appt-professionals", salonId] as const,
  serviceProfessionals: (salonId: string) => ["appt-service-prof", salonId] as const,
  availability: (salonSlug: string, serviceId: string, professionalId: string, date: string) =>
    ["appt-availability", salonSlug, serviceId, professionalId, date] as const,
  // Clave distinta de `availability`: la vista de REJILLA (`view=day`) devuelve una forma
  // distinta (`PublicDaySlot[]`, jornada completa) que NO debe compartir caché con la de
  // solo-libres (`PublicSlot[]`).
  availabilityDay: (
    salonSlug: string,
    serviceId: string,
    professionalId: string,
    date: string,
  ) => ["appt-availability-day", salonSlug, serviceId, professionalId, date] as const,
};
