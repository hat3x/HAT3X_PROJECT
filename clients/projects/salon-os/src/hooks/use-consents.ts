"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createConsent,
  revokeConsent,
  signConsent,
  type CreateConsentInput,
  type SignConsentInput,
} from "@/app/(dashboard)/expediente/actions";
import { consentKeys, fetchConsents } from "@/lib/queries/consents";

/** Lista de consentimientos informados de un paciente, más recientes primero. */
export function useConsents(salonId: string, customerId: string) {
  return useQuery({
    queryKey: consentKeys.list(salonId, customerId),
    queryFn: () => fetchConsents(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/** Crea un consentimiento informado. Invalida la lista del paciente en éxito. */
export function useCreateConsent(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateConsentInput) => {
      const result = await createConsent(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consentKeys.list(salonId, customerId),
      });
    },
  });
}

/** Firma un consentimiento (`pending` → `signed`). Invalida la lista en éxito. */
export function useSignConsent(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { consentId: string } & SignConsentInput) => {
      const { consentId, ...rest } = input;
      const result = await signConsent(consentId, rest);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consentKeys.list(salonId, customerId),
      });
    },
  });
}

/** Revoca un consentimiento (`signed` → `revoked`). Invalida la lista en éxito. */
export function useRevokeConsent(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (consentId: string) => {
      const result = await revokeConsent(consentId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consentKeys.list(salonId, customerId),
      });
    },
  });
}
