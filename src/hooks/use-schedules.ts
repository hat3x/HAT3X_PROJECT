"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createException,
  createSalonOpeningException,
  deleteException,
  deleteSalonOpeningException,
  saveSalonSchedule,
  saveWeeklySchedule,
  type SalonOpeningExceptionInput,
} from "@/app/(dashboard)/ajustes/horarios/actions";
import {
  fetchSalonOpeningExceptions,
  fetchSalonSchedule,
  fetchScheduleExceptions,
  fetchWeeklySchedule,
  scheduleKeys,
} from "@/lib/queries/schedules";
import type {
  ExceptionInput,
  SalonWeeklyScheduleInput,
  WeeklyScheduleInput,
} from "@/lib/validations/schedule";
import type { ScheduleException } from "@/types/database";

/** Horario semanal (tramos) de un profesional. */
export function useWeeklySchedule(salonId: string, professionalId: string) {
  return useQuery({
    queryKey: scheduleKeys.weekly(salonId, professionalId),
    queryFn: () => fetchWeeklySchedule(salonId, professionalId),
    enabled: professionalId !== "",
  });
}

/** Horario de apertura de la clínica (a nivel de salón). */
export function useSalonSchedule(salonId: string) {
  return useQuery({
    queryKey: scheduleKeys.salon(salonId),
    queryFn: () => fetchSalonSchedule(salonId),
    enabled: salonId !== "",
  });
}

/** Guarda (reemplaza) el horario de apertura de la clínica y refresca la caché. */
export function useSaveSalonSchedule(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalonWeeklyScheduleInput): Promise<null> => {
      const result = await saveSalonSchedule(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.salon(salonId),
      });
    },
  });
}

/** Excepciones de horario (días libres u horario especial) de un profesional. */
export function useScheduleExceptions(salonId: string, professionalId: string) {
  return useQuery({
    queryKey: scheduleKeys.exceptions(salonId, professionalId),
    queryFn: () => fetchScheduleExceptions(salonId, professionalId),
    enabled: professionalId !== "",
  });
}

/** Guarda (reemplaza) el horario semanal de un profesional y refresca la caché. */
export function useSaveWeeklySchedule(salonId: string, professionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: WeeklyScheduleInput): Promise<null> => {
      const result = await saveWeeklySchedule(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.weekly(salonId, professionalId),
      });
    },
  });
}

/** Crea una excepción de horario y refresca la lista del profesional. */
export function useCreateException(salonId: string, professionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExceptionInput): Promise<ScheduleException> => {
      const result = await createException(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.exceptions(salonId, professionalId),
      });
    },
  });
}

/** Elimina una excepción de horario y refresca la lista del profesional. */
export function useDeleteException(salonId: string, professionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exceptionId: string): Promise<string> => {
      const result = await deleteException(exceptionId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return exceptionId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.exceptions(salonId, professionalId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Excepciones del horario de la CLÍNICA
// ---------------------------------------------------------------------------

/** Cierres y turnos extra de la clínica, de hoy en adelante. */
export function useSalonOpeningExceptions(salonId: string, desde: string) {
  return useQuery({
    queryKey: [...scheduleKeys.salonExceptions(salonId), desde],
    queryFn: () => fetchSalonOpeningExceptions(salonId, desde),
  });
}

/**
 * Al crear o borrar se invalida TAMBIÉN la agenda: una excepción cambia qué
 * huecos existen, y dejar la agenda con la respuesta anterior haría dudar de si
 * el cambio se guardó.
 */
export function useCreateSalonOpeningException(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalonOpeningExceptionInput) => {
      const result = await createSalonOpeningException(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.salonExceptions(salonId) });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useDeleteSalonOpeningException(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteSalonOpeningException(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.salonExceptions(salonId) });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}
