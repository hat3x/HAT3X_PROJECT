"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sendRecallReminder } from "@/app/(dashboard)/recordatorios/recall-actions";
import {
  fetchPatientsDueForRecall,
  recallKeys,
  DEFAULT_RECALL_MONTHS,
} from "@/lib/queries/recall";

/** Pacientes pendientes de recordatorio de revisión (según meses sin venir). */
export function usePatientsDueForRecall(
  salonId: string,
  monthsSince: number = DEFAULT_RECALL_MONTHS,
) {
  return useQuery({
    queryKey: recallKeys.due(salonId, monthsSince),
    queryFn: () => fetchPatientsDueForRecall(salonId, monthsSince),
  });
}

/** Envía el recordatorio de revisión a un paciente e invalida la lista de recall. */
export function useSendRecallReminder(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => sendRecallReminder(customerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recallKeys.all(salonId) });
    },
  });
}
