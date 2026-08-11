"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addOrthoVisit,
  deleteOrthoVisit,
  saveOrthoData,
} from "@/app/(dashboard)/ortodoncia/actions";
import { fetchOrthoData, fetchOrthoVisits, orthoKeys } from "@/lib/queries/ortho";
import type { OrthoDataInput, OrthoVisitInput } from "@/lib/validations/ortho";

export function useOrthoData(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.data(salonId, customerId),
    queryFn: () => fetchOrthoData(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useOrthoVisits(salonId: string, customerId: string) {
  return useQuery({
    queryKey: orthoKeys.visits(salonId, customerId),
    queryFn: () => fetchOrthoVisits(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

export function useSaveOrthoData(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoDataInput) => {
      const result = await saveOrthoData(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.data(salonId, customerId),
      });
    },
  });
}

export function useAddOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrthoVisitInput) => {
      const result = await addOrthoVisit(customerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}

export function useDeleteOrthoVisit(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const result = await deleteOrthoVisit(visitId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orthoKeys.visits(salonId, customerId),
      });
    },
  });
}
