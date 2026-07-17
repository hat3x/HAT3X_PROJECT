"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createSale,
  lookupLoyaltyByQr,
  retrySaleLoyalty,
  type LoyaltyLookupActionResult,
  type RetryLoyaltyOutcome,
  type SaleReceipt,
} from "@/app/(dashboard)/tpv/actions";
import {
  fetchOpenAppointments,
  fetchSalePaymentMethods,
  fetchSaleProducts,
  fetchSaleServices,
  posKeys,
} from "@/lib/queries/pos";
import type { RetrySaleLoyaltyInput, SaleInput } from "@/lib/validations/sale";

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

/**
 * Consulta de SOLO LECTURA del estado de fidelización de un cliente a partir del
 * QR escaneado en el TPV. `lookupLoyaltyByQr` NUNCA lanza (devuelve un resultado
 * controlado), así que la mutación siempre "resuelve": el desenlace `ok`/error
 * vive en `data` y se pinta sin romper la caja cuando no hay cliente escaneado.
 * Es una mutación (no `useQuery`) porque la dispara un gesto explícito —el
 * escaneo— y no debe reejecutarse ni cachearse por `queryKey`.
 */
export function useLoyaltyLookup() {
  return useMutation({
    mutationFn: (qrToken: string): Promise<LoyaltyLookupActionResult> =>
      lookupLoyaltyByQr(qrToken),
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

/**
 * Reintento MANUAL de la acreditación de fidelización de una venta ya cobrada
 * (§sub-7). Se usa solo cuando el best-effort de `createSale` falló: el cajero
 * reacredita sobre la MISMA venta sin re-cobrar. `retrySaleLoyalty` es idempotente
 * por la `ref` de la venta, así que reintentar no duplica los puntos. Al lograrlo,
 * invalida las consultas del TPV (el saldo del cliente ha cambiado). Es una
 * mutación (no `useQuery`) porque la dispara un gesto explícito —pulsar el botón—.
 */
export function useRetrySaleLoyalty(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: RetrySaleLoyaltyInput,
    ): Promise<RetryLoyaltyOutcome> => {
      const result = await retrySaleLoyalty(input);
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
