"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { addOdontogramFinding } from "@/app/(dashboard)/odontograma/actions";
import {
  deriveCurrentStates,
  fetchOdontogramFindings,
  odontogramKeys,
} from "@/lib/queries/odontogram";
import type { OdontogramFindingInsert } from "@/types/database";

/**
 * Loads all findings for a patient and derives the current state per tooth.
 * Disabled when `clinicalRecordId` is empty (demo / no-patient mode).
 */
export function useOdontogramFindings(
  salonId: string,
  clinicalRecordId: string,
) {
  return useQuery({
    queryKey: odontogramKeys.findings(salonId, clinicalRecordId),
    queryFn: () => fetchOdontogramFindings(salonId, clinicalRecordId),
    enabled: clinicalRecordId.length > 0,
    select: (data) => ({
      findings: data,
      currentStates: deriveCurrentStates(data),
    }),
  });
}

/**
 * Appends a new finding event. Invalidates the findings cache on success so
 * the chart re-renders with the updated tooth states.
 */
export function useAddFinding(salonId: string, clinicalRecordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OdontogramFindingInsert) => {
      const result = await addOdontogramFinding(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: odontogramKeys.findings(salonId, clinicalRecordId),
      });
    },
  });
}
