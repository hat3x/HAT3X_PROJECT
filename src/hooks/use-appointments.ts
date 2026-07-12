"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  updateAppointmentStatus,
  createAppointment,
  rescheduleAppointment,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from "@/app/(dashboard)/appointments/actions";
import {
  appointmentKeys,
  fetchAppointments,
  fetchProfessionalsForDashboard,
  fetchServiceProfessionalsMap,
  fetchServicesForDashboard,
} from "@/lib/queries/appointments";
import type { PublicSlot } from "@/lib/booking/types";
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
