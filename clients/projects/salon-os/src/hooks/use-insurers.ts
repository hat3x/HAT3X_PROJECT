"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createInsurer,
  deleteInsurer,
  removeInsurerServicePrice,
  setInsurerServicePrice,
  updateInsurer,
  type InsurerFormInput,
  type SetInsurerServicePriceInput,
} from "@/app/(dashboard)/ajustes/mutuas/actions";
import {
  addCustomerInsurance,
  removeCustomerInsurance,
  type AddCustomerInsuranceInput,
} from "@/app/(dashboard)/customers/insurance-actions";
import { setPlanInsurer } from "@/app/(dashboard)/planes/actions";
import {
  fetchCustomerInsurances,
  fetchInsurers,
  fetchInsurerTariff,
  insurerKeys,
} from "@/lib/queries/insurers";
import { treatmentKeys } from "@/lib/queries/treatment";
import type { Insurer, InsurerServicePrice } from "@/types/database";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Catálogo de aseguradoras del salón. */
export function useInsurers(salonId: string) {
  return useQuery({
    queryKey: insurerKeys.lists(salonId),
    queryFn: () => fetchInsurers(salonId),
  });
}

/** Seguros/mutuas de un paciente. */
export function useCustomerInsurances(salonId: string, customerId: string) {
  return useQuery({
    queryKey: insurerKeys.customerInsurances(salonId, customerId),
    queryFn: () => fetchCustomerInsurances(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/** Baremo (precio por servicio) de una aseguradora. */
export function useInsurerTariff(salonId: string, insurerId: string) {
  return useQuery({
    queryKey: insurerKeys.tariff(salonId, insurerId),
    queryFn: () => fetchInsurerTariff(salonId, insurerId),
    enabled: insurerId.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutaciones — catálogo de aseguradoras
// ---------------------------------------------------------------------------

/** Crea una aseguradora y refresca el catálogo. */
export function useCreateInsurer(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsurerFormInput): Promise<Insurer> => {
      const result = await createInsurer(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: insurerKeys.lists(salonId) });
    },
  });
}

/** Actualiza una aseguradora y refresca el catálogo. */
export function useUpdateInsurer(salonId: string, insurerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsurerFormInput): Promise<Insurer> => {
      const result = await updateInsurer(insurerId, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: insurerKeys.lists(salonId) });
    },
  });
}

/** Elimina una aseguradora y refresca el catálogo. */
export function useDeleteInsurer(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (insurerId: string): Promise<string> => {
      const result = await deleteInsurer(insurerId);
      if (!result.ok) throw new Error(result.error);
      return insurerId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: insurerKeys.lists(salonId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutaciones — baremo (insurer_service_price)
// ---------------------------------------------------------------------------

/** Fija (crea o actualiza) el precio de un servicio en el baremo de la aseguradora. */
export function useSetInsurerServicePrice(salonId: string, insurerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SetInsurerServicePriceInput,
    ): Promise<InsurerServicePrice> => {
      const result = await setInsurerServicePrice(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: insurerKeys.tariff(salonId, insurerId),
      });
    },
  });
}

/** Quita un precio del baremo de la aseguradora. */
export function useRemoveInsurerServicePrice(salonId: string, insurerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (priceId: string) => {
      const result = await removeInsurerServicePrice(priceId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: insurerKeys.tariff(salonId, insurerId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutaciones — seguro del paciente
// ---------------------------------------------------------------------------

/** Añade un seguro/mutua a un paciente. */
export function useAddCustomerInsurance(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddCustomerInsuranceInput) => {
      const result = await addCustomerInsurance(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: insurerKeys.customerInsurances(salonId, customerId),
      });
    },
  });
}

/** Quita un seguro/mutua de un paciente. */
export function useRemoveCustomerInsurance(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (insuranceId: string) => {
      const result = await removeCustomerInsurance(insuranceId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: insurerKeys.customerInsurances(salonId, customerId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutación — marcar el plan con una mutua
// ---------------------------------------------------------------------------

/**
 * Marca (o desmarca, con `null`) el plan de tratamiento activo con una
 * aseguradora. Invalida el detalle del plan (`treatmentKeys.plan`) — igual
 * que el resto de mutaciones de `use-treatment.ts` — porque `insurer_id` vive
 * en `treatment_plan`, no en las tablas de mutuas.
 */
export function useSetPlanInsurer(salonId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (insurerId: string | null) => {
      const result = await setPlanInsurer(planId, insurerId);
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
