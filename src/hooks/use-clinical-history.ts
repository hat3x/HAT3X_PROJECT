"use client";

import { useQuery } from "@tanstack/react-query";

import {
  clinicalHistoryKeys,
  fetchClinicalHistory,
} from "@/lib/queries/clinical-history";

/** Devuelve el historial clínico / evolutivo del paciente (solo lectura). */
export function useClinicalHistory(salonId: string, customerId: string) {
  return useQuery({
    queryKey: clinicalHistoryKeys.patient(salonId, customerId),
    queryFn: () => fetchClinicalHistory(salonId, customerId),
  });
}
