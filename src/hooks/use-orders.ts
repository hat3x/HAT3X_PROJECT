"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addOrderItems,
  createOrder,
  sendOrderToStations,
  settleOrder,
  setOrderItemStatus,
  voidOrderItem,
} from "@/app/(dashboard)/mostrador/actions";
import { fetchOpenOrders, fetchOrderItems, orderKeys } from "@/lib/queries/orders";
import type {
  AddOrderItemsInput,
  CreateOrderInput,
  SendOrderToStationsInput,
  SettleOrderInput,
  SetOrderItemStatusInput,
  VoidOrderItemInput,
} from "@/lib/validations/order";
import type { Order, OrderItem } from "@/types/database";

export function useOpenOrders(salonId: string) {
  return useQuery({ queryKey: orderKeys.open(salonId), queryFn: () => fetchOpenOrders(salonId) });
}
export function useOrderItems(salonId: string, orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(salonId, orderId ?? "none"),
    queryFn: () => fetchOrderItems(salonId, orderId as string),
    enabled: orderId !== null,
  });
}

/** Invalida todas las queries de pedidos del salón (abiertos + detalle de cada uno). */
function useInvalidateOrders(salonId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orderKeys.all(salonId) });
}

export function useCreateOrder(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<Order> => {
      const result = await createOrder(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useAddOrderItems(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: AddOrderItemsInput): Promise<{ added: number }> => {
      const result = await addOrderItems(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useVoidOrderItem(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: VoidOrderItemInput): Promise<OrderItem> => {
      const result = await voidOrderItem(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useSendOrderToStations(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: SendOrderToStationsInput): Promise<{ sent: number }> => {
      const result = await sendOrderToStations(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useSetOrderItemStatus(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: SetOrderItemStatusInput): Promise<OrderItem> => {
      const result = await setOrderItemStatus(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

/**
 * Cobra un pedido de mostrador (Task 6): materializa el `pos_sale` vía
 * `settleOrder`. Invalida los pedidos abiertos del salón al terminar —el
 * pedido cobrado deja de aparecer entre los abiertos (`status: "cobrada"`).
 */
export function useSettleOrder(salonId: string) {
  const invalidate = useInvalidateOrders(salonId);
  return useMutation({
    mutationFn: async (input: SettleOrderInput): Promise<{ saleId: string; totalCents: number }> => {
      const result = await settleOrder(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}
