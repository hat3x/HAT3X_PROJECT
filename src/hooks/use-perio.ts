"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  savePerioMeasurements,
  signPerioExam,
  type PerioSiteInput,
  type PerioToothInput,
} from "@/app/(dashboard)/periodontograma/actions";
import {
  fetchPerioExam,
  fetchPerioExams,
  perioKeys,
} from "@/lib/queries/perio";

/** Lista de exploraciones periodontales de un paciente, más recientes primero. */
export function usePerioExams(salonId: string, customerId: string) {
  return useQuery({
    queryKey: perioKeys.exams(salonId, customerId),
    queryFn: () => fetchPerioExams(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/** Detalle completo de una exploración: cabecera + dientes + sitios. */
export function usePerioExam(salonId: string, examId: string) {
  return useQuery({
    queryKey: perioKeys.exam(salonId, examId),
    queryFn: () => fetchPerioExam(salonId, examId),
    enabled: examId.length > 0,
  });
}

/**
 * Guarda los datos por diente y las mediciones por sitio de una exploración
 * en borrador. Invalida el detalle de la exploración en éxito.
 */
export function useSavePerioExam(salonId: string, examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      teeth: PerioToothInput[];
      sites: PerioSiteInput[];
    }) => {
      const result = await savePerioMeasurements(examId, input.teeth, input.sites);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: perioKeys.exam(salonId, examId),
      });
    },
  });
}

/**
 * Firma la exploración (irreversible en BD). Invalida el detalle de la
 * exploración en éxito para reflejar `signed: true`.
 */
export function useSignPerioExam(salonId: string, examId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await signPerioExam(examId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: perioKeys.exam(salonId, examId),
      });
    },
  });
}
