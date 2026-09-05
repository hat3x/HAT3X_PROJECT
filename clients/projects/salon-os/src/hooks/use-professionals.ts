"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createProfessional,
  deleteProfessional,
  updateProfessional,
} from "@/app/(dashboard)/ajustes/personal/actions";
import {
  fetchProfessionals,
  professionalKeys,
} from "@/lib/queries/professionals";
import type { ProfessionalInput } from "@/lib/validations/professional";
import type { Professional } from "@/types/database";

/** Lista de profesionales con búsqueda; mantiene los datos previos al teclear. */
export function useProfessionals(salonId: string, search: string) {
  return useQuery({
    queryKey: professionalKeys.list(salonId, search),
    queryFn: () => fetchProfessionals(salonId, search),
    placeholderData: keepPreviousData,
  });
}

/** Crea un profesional y refresca las listas. */
export function useCreateProfessional(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfessionalInput): Promise<Professional> => {
      const result = await createProfessional(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: professionalKeys.lists(salonId),
      });
    },
  });
}

/** Actualiza un profesional y refresca las listas. */
export function useUpdateProfessional(salonId: string, professionalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfessionalInput): Promise<Professional> => {
      const result = await updateProfessional(professionalId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: professionalKeys.lists(salonId),
      });
    },
  });
}

/** Elimina un profesional y refresca las listas. */
export function useDeleteProfessional(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (professionalId: string): Promise<string> => {
      const result = await deleteProfessional(professionalId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return professionalId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: professionalKeys.lists(salonId),
      });
    },
  });
}
