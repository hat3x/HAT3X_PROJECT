"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { saveClinicalRecord } from "@/app/(dashboard)/customers/clinical-record-actions";
import {
  customerKeys,
  fetchClinicalRecord,
} from "@/lib/queries/customers";
import type { ClinicalRecordInput } from "@/lib/validations/clinical-record";
import type { ClinicalRecord } from "@/types/database";

/** Ficha clínica del cliente. `data` es `null` cuando todavía no se ha creado. */
export function useClinicalRecord(salonId: string, customerId: string) {
  return useQuery({
    queryKey: customerKeys.clinicalRecord(salonId, customerId),
    queryFn: () => fetchClinicalRecord(salonId, customerId),
  });
}

/**
 * Mutation de upsert de la ficha clínica.
 * Actualiza la caché en éxito para evitar refetch adicional.
 */
export function useSaveClinicalRecord(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClinicalRecordInput): Promise<ClinicalRecord> => {
      const result = await saveClinicalRecord(customerId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        customerKeys.clinicalRecord(salonId, customerId),
        data,
      );
    },
  });
}
