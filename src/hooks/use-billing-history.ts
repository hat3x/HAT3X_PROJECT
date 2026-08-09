"use client";

import { useQuery } from "@tanstack/react-query";

import {
  billingHistoryKeys,
  fetchBillingHistory,
} from "@/lib/queries/billing-history";

/** Devuelve las facturas históricas del paciente (solo lectura). */
export function useBillingHistory(salonId: string, customerId: string) {
  return useQuery({
    queryKey: billingHistoryKeys.patient(salonId, customerId),
    queryFn: () => fetchBillingHistory(salonId, customerId),
  });
}
