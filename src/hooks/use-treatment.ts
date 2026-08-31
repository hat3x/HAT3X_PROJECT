"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addPlanItem,
  createPlan,
  deletePlan,
  deletePlanItem,
  transitionPlanItem,
  type AddPlanItemInput,
  type CreatePlanInput,
} from "@/app/(dashboard)/planes/actions";
import { fetchPlan, fetchPlans, treatmentKeys } from "@/lib/queries/treatment";
import type { PlanItemState } from "@/types/database";

/** Lista de planes de tratamiento de un paciente, más recientes primero. */
export function usePlans(salonId: string, customerId: string) {
  return useQuery({
    queryKey: treatmentKeys.plans(salonId, customerId),
    queryFn: () => fetchPlans(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/** Detalle completo de un plan: cabecera + fases + items. */
export function usePlan(salonId: string, planId: string) {
  return useQuery({
    queryKey: treatmentKeys.plan(salonId, planId),
    queryFn: () => fetchPlan(salonId, planId),
    enabled: planId.length > 0,
  });
}

/** Crea un plan de tratamiento. Invalida la lista de planes del paciente en éxito. */
export function useCreatePlan(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePlanInput) => {
      const result = await createPlan(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plans(salonId, customerId),
      });
    },
  });
}

/** Añade una línea presupuestada a un plan. Invalida el detalle del plan en éxito. */
export function useAddPlanItem(salonId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddPlanItemInput) => {
      const result = await addPlanItem(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plan(salonId, planId),
      });
    },
  });
}

/** Transiciona el estado de una línea del plan. Invalida el detalle del plan en éxito. */
export function useTransitionPlanItem(salonId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; toState: PlanItemState }) => {
      const result = await transitionPlanItem(input.itemId, input.toState);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plan(salonId, planId),
      });
    },
  });
}

/** Elimina una línea del plan. Invalida el detalle del plan en éxito. */
export function useDeletePlanItem(salonId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const result = await deletePlanItem(itemId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plan(salonId, planId),
      });
    },
  });
}

/**
 * Borra un plan entero. Invalida la LISTA de planes del paciente (no el
 * detalle: el plan que se estaba mirando ya no existe).
 *
 * El servidor solo acepta borradores y planes anulados; si el estado cambió
 * entre que se pintó el botón y se pulsó, llega su mensaje explicando por qué.
 */
export function useDeletePlan(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      const result = await deletePlan(planId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plans(salonId, customerId),
      });
    },
  });
}
