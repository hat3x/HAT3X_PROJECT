"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  updateAppointmentStatus,
  createAppointment,
  rescheduleAppointment,
  deleteAppointment,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from "@/app/(dashboard)/appointments/actions";
import { sendAppointmentReminder } from "@/app/(dashboard)/appointments/reminder-actions";
import {
  appointmentKeys,
  fetchAppointments,
  fetchAppointmentsRange,
  fetchProfessionalsForDashboard,
  fetchServiceProfessionalsMap,
  fetchServicesForDashboard,
} from "@/lib/queries/appointments";
import type {
  AvailabilityResponse,
  DayAvailabilityResponse,
  PublicDaySlot,
  PublicSlot,
} from "@/lib/booking/types";
import type { AppointmentStatus } from "@/types/database";

/** Citas del día (re-fetches cuando cambia fecha o profesional). */
export function useAppointments(
  salonId: string,
  date: string,
  timezone: string,
  professionalId: string | null,
) {
  return useQuery({
    queryKey: appointmentKeys.list(salonId, date, professionalId),
    queryFn: () => fetchAppointments(salonId, date, timezone, professionalId),
  });
}

/**
 * Citas del salón en un rango de días locales [startDate, endDateExclusive)
 * ("YYYY-MM-DD"). Para las vistas de calendario (semana / mes / año).
 */
export function useAppointmentsRange(
  salonId: string,
  startDate: string,
  endDateExclusive: string,
  timezone: string,
) {
  return useQuery({
    queryKey: appointmentKeys.range(salonId, startDate, endDateExclusive),
    queryFn: () =>
      fetchAppointmentsRange(salonId, startDate, endDateExclusive, timezone),
  });
}

/** Servicios activos (stale 5 min: no cambian frecuentemente). */
export function useServices(salonId: string) {
  return useQuery({
    queryKey: appointmentKeys.services(salonId),
    queryFn: () => fetchServicesForDashboard(salonId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Profesionales activos. */
export function useProfessionals(salonId: string) {
  return useQuery({
    queryKey: appointmentKeys.professionals(salonId),
    queryFn: () => fetchProfessionalsForDashboard(salonId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Mapa serviceId → professionalId[] (quién presta qué). */
export function useServiceProfessionalsMap(salonId: string) {
  return useQuery({
    queryKey: appointmentKeys.serviceProfessionals(salonId),
    queryFn: () => fetchServiceProfessionalsMap(salonId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Slots disponibles vía la API pública de reserva (reutiliza la lógica del wizard). */
export function useAvailabilitySlots(
  salonSlug: string,
  serviceId: string | null,
  professionalId: string,
  date: string,
) {
  return useQuery({
    queryKey: appointmentKeys.availability(salonSlug, serviceId ?? "", professionalId, date),
    enabled: Boolean(serviceId) && Boolean(date),
    queryFn: async (): Promise<PublicSlot[]> => {
      const params = new URLSearchParams({ serviceId: serviceId ?? "", date });
      if (professionalId !== "any") params.set("professionalId", professionalId);
      const res = await fetch(
        `/api/public/booking/${salonSlug}/availability?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Error al cargar disponibilidad");
      const json = (await res.json()) as { slots: PublicSlot[] };
      return json.slots;
    },
  });
}

/**
 * Rejilla COMPLETA de la jornada (`view=day`) para el selector de creación de cita del
 * panel: pinta la MISMA cuadrícula que la reserva pública (libres + ocupados/pasados/
 * cerrados con su motivo), reutilizando el componente `DaySlots`.
 *
 * Con un profesional CONCRETO pide la vista de rejilla al endpoint. Con «cualquiera» esa
 * vista no aplica (es per-profesional): cae en la vista de solo-libres y los normaliza a
 * la misma forma (`available: true`) para pintarlos con el MISMO componente sin ramas.
 * En cualquier caso, solo los `available` son reservables, así que el panel sigue
 * reservando únicamente huecos libres.
 */
export function useAvailabilityDaySlots(
  salonSlug: string,
  serviceId: string | null,
  professionalId: string,
  date: string,
) {
  return useQuery({
    queryKey: appointmentKeys.availabilityDay(
      salonSlug,
      serviceId ?? "",
      professionalId,
      date,
    ),
    enabled: Boolean(serviceId) && Boolean(date),
    queryFn: async (): Promise<PublicDaySlot[]> => {
      const params = new URLSearchParams({ serviceId: serviceId ?? "", date });
      const concrete = professionalId !== "any";
      if (concrete) {
        params.set("professionalId", professionalId);
        params.set("view", "day");
      }
      const res = await fetch(
        `/api/public/booking/${salonSlug}/availability?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Error al cargar disponibilidad");
      const json = (await res.json()) as
        | DayAvailabilityResponse
        | AvailabilityResponse;
      if (concrete) {
        return (json as DayAvailabilityResponse).daySlots;
      }
      return (json as AvailabilityResponse).slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        professionalId: slot.professionalId,
        available: true,
      }));
    },
  });
}

/** Cambia el estado de una cita e invalida la lista del día. */
export function useUpdateAppointmentStatus(
  salonId: string,
  date: string,
  professionalId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: AppointmentStatus;
      reason?: string;
    }) => updateAppointmentStatus(id, status, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: appointmentKeys.list(salonId, date, professionalId),
      });
    },
  });
}

/**
 * BORRA (hard delete) una cita e invalida la lista del día. La mutación LANZA si
 * la action devuelve `{ ok: false }` (p. ej. FK / sin permiso), para que la UI
 * pueda mostrar el error vía `isError`/`onError`.
 */
export function useDeleteAppointment(
  salonId: string,
  date: string,
  professionalId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteAppointment(id);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: appointmentKeys.list(salonId, date, professionalId),
      });
    },
  });
}

/** Crea una cita desde el panel e invalida todas las listas del salón. */
export function useCreateAppointment(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAppointmentInput) => createAppointment(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.all(salonId) });
    },
  });
}

/** Reprograma una cita (cambia fecha/hora/profesional) e invalida la agenda. */
export function useRescheduleAppointment(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RescheduleAppointmentInput) => rescheduleAppointment(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.all(salonId) });
    },
  });
}

/**
 * Envía al instante un recordatorio WhatsApp de la cita indicada. No invalida
 * ninguna caché (no cambia datos de la cita): el resultado (enviado / modo
 * prueba / error) se consume directamente en `onSuccess` del `mutate`.
 */
export function useSendAppointmentReminder() {
  return useMutation({
    mutationFn: (appointmentId: string) => sendAppointmentReminder(appointmentId),
  });
}
