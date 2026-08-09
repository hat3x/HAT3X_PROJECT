"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchMenuCategories, fetchMenuProducts, fetchStations, menuKeys } from "@/lib/queries/menu";

export function useMenuCategories(salonId: string) {
  return useQuery({ queryKey: menuKeys.categories(salonId), queryFn: () => fetchMenuCategories(salonId) });
}
export function useStations(salonId: string) {
  return useQuery({ queryKey: menuKeys.stations(salonId), queryFn: () => fetchStations(salonId) });
}
export function useMenuProducts(salonId: string) {
  return useQuery({ queryKey: menuKeys.products(salonId), queryFn: () => fetchMenuProducts(salonId) });
}
