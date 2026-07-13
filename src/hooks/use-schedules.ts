"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createException,
  deleteException,
  saveWeeklySchedule,
} from "@/app/(dashboard)/ajustes/horarios/actions";
import {
  fetchScheduleExceptions,
  fetchWeeklySchedule,
  scheduleKeys,
} from "@/lib/queries/schedules";
import type {
  ExceptionInput,
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
