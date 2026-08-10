"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchOpenOrders, fetchOrderItems, orderKeys } from "@/lib/queries/orders";

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
