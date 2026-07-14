"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { createSale, type SaleReceipt } from "@/app/(dashboard)/tpv/actions";
import {
  fetchOpenAppointments,
  fetchSalePaymentMethods,
  fetchSaleProducts,
  fetchSaleServices,
  posKeys,
} from "@/lib/queries/pos";
import type { SaleInput } from "@/lib/validations/sale";

/** Servicios activos para añadir al ticket; mantiene datos previos al teclear. */
export function useSaleServices(salonId: string, search: string) {
  return useQuery({
    queryKey: posKeys.services(salonId, search),
    queryFn: () => fetchSaleServices(salonId, search),
    placeholderData: keepPreviousData,
  });
}

/** Productos activos para añadir al ticket; mantiene datos previos al teclear. */
export function useSaleProducts(salonId: string, search: string) {
  return useQuery({
    queryKey: posKeys.products(salonId, search),
    queryFn: () => fetchSaleProducts(salonId, search),
    placeholderData: keepPreviousData,
  });
}

/** Métodos de pago activos del catálogo del salón. */
export function useSalePaymentMethods(salonId: string) {
  return useQuery({
    queryKey: posKeys.paymentMethods(salonId),
    queryFn: () => fetchSalePaymentMethods(salonId),
  });
}

/** Citas del día para arrancar una venta "desde cita". */
export function useOpenAppointments(
  salonId: string,
  date: string,
  timezone: string,
) {
  return useQuery({
    queryKey: posKeys.appointments(salonId, date),
    queryFn: () => fetchOpenAppointments(salonId, date, timezone),
  });
}

/**
 * Registra la venta en caja. Al completarse invalida las consultas del TPV del
 * salón (p. ej. las citas, cuyo estado de facturación puede cambiar en vistas
 * futuras) y devuelve el recibo con los totales calculados en servidor.
 */
export function useCreateSale(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput): Promise<SaleReceipt> => {
      const result = await createSale(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: posKeys.all(salonId) });
    },
  });
}
