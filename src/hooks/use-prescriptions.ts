"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPrescriptionItem,
  createPrescription,
  deletePrescription,
  issuePrescription,
  revokePrescription,
  type AddPrescriptionItemInput,
  type CreatePrescriptionInput,
} from "@/app/(dashboard)/expediente/prescription-actions";
import {
  fetchPrescriptionItems,
  fetchPrescriptions,
  prescriptionKeys,
} from "@/lib/queries/prescriptions";

/** Lista de recetas (cabeceras) de un paciente, más recientes primero. */
export function usePrescriptions(salonId: string, customerId: string) {
  return useQuery({
    queryKey: prescriptionKeys.list(salonId, customerId),
    queryFn: () => fetchPrescriptions(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/** Renglones de medicación de una receta, en el orden de `position`. */
export function usePrescriptionItems(salonId: string, prescriptionId: string) {
  return useQuery({
    queryKey: prescriptionKeys.items(salonId, prescriptionId),
    queryFn: () => fetchPrescriptionItems(salonId, prescriptionId),
    enabled: prescriptionId.length > 0,
  });
}

/** Crea la cabecera de una receta (borrador). Invalida la lista del paciente en éxito. */
export function useCreatePrescription(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) => {
      const result = await createPrescription(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.list(salonId, customerId),
      });
    },
  });
}

/** Añade un renglón de medicación a una receta. Invalida sus renglones en éxito. */
export function useAddPrescriptionItem(salonId: string, prescriptionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddPrescriptionItemInput) => {
      const result = await addPrescriptionItem(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.items(salonId, prescriptionId),
      });
    },
  });
}

/** Emite una receta (`'draft' → 'issued'`). Invalida la lista del paciente en éxito. */
export function useIssuePrescription(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prescriptionId: string) => {
      const result = await issuePrescription(prescriptionId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.list(salonId, customerId),
      });
    },
  });
}

/** Revoca una receta (`'issued' → 'revoked'`). Invalida la lista del paciente en éxito. */
export function useRevokePrescription(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prescriptionId: string) => {
      const result = await revokePrescription(prescriptionId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.list(salonId, customerId),
      });
    },
  });
}

/** Borra una receta en borrador. Invalida la lista del paciente en éxito. */
export function useDeletePrescription(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prescriptionId: string) => {
      const result = await deletePrescription(prescriptionId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.list(salonId, customerId),
      });
    },
  });
}
