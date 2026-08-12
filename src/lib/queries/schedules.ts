import { createClient } from "@/lib/supabase/client";
import type {
  ProfessionalSchedule,
  SalonOpeningHour,
  ScheduleException,
} from "@/types/database";

/**
 * Fábrica de claves de caché para TanStack Query.
 * Todo se scopea por `salonId` (aislamiento de tenants) y por `professionalId`
 * (cada profesional tiene su propio horario y sus propias excepciones).
 */
export const scheduleKeys = {
  all: (salonId: string) => ["schedules", salonId] as const,
  professional: (salonId: string, professionalId: string) =>
    [...scheduleKeys.all(salonId), professionalId] as const,
  weekly: (salonId: string, professionalId: string) =>
    [...scheduleKeys.professional(salonId, professionalId), "weekly"] as const,
  exceptions: (salonId: string, professionalId: string) =>
    [
      ...scheduleKeys.professional(salonId, professionalId),
      "exceptions",
    ] as const,
  /** Horario de apertura de la clínica (a nivel de salón). */
  salon: (salonId: string) =>
    [...scheduleKeys.all(salonId), "salon-opening-hours"] as const,
};

/**
 * Horario de apertura de la clínica/salón, ordenado por día y hora de inicio.
 * Horas tal cual las guarda Postgres (`HH:MM:SS`); la UI las normaliza a `HH:MM`.
 */
export async function fetchSalonSchedule(
  salonId: string,
): Promise<SalonOpeningHour[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("salon_opening_hours")
    .select("*")
    .eq("salon_id", salonId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Tramos del horario semanal de un profesional, ordenados por día y hora de
 * inicio. Devuelve las horas tal cual las guarda Postgres (`HH:MM:SS`); la capa
 * de UI las normaliza a `HH:MM` para los inputs de tipo `time`.
 */
export async function fetchWeeklySchedule(
  salonId: string,
  professionalId: string,
): Promise<ProfessionalSchedule[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("professional_schedules")
    .select("*")
    .eq("salon_id", salonId)
    .eq("professional_id", professionalId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Excepciones de horario de un profesional (días libres u horario especial),
 * ordenadas por fecha ascendente.
 */
export async function fetchScheduleExceptions(
  salonId: string,
  professionalId: string,
): Promise<ScheduleException[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("schedule_exceptions")
    .select("*")
    .eq("salon_id", salonId)
    .eq("professional_id", professionalId)
    .order("exception_date", { ascending: true });

  if (error !== null) {
    throw new Error(error.message);
  }
  return data;
}
