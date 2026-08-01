"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  recordStockMovement,
  type RecordStockMovementInput,
} from "@/app/(dashboard)/products/stock-actions";
import { productKeys } from "@/lib/queries/products";
import {
  fetchExpiringSoon,
  fetchLowStock,
  fetchProductsWithStock,
  fetchStockMovements,
  stockKeys,
} from "@/lib/queries/stock";
import type { StockMovement } from "@/types/database";

/** Ventana por defecto (días) para el aviso de caducidades próximas. */
export const DEFAULT_EXPIRING_SOON_DAYS = 60;

/** Catálogo de productos activos con stock/mínimo/unidad. */
export function useProductsWithStock(salonId: string) {
  return useQuery({
    queryKey: stockKeys.products(salonId),
    queryFn: () => fetchProductsWithStock(salonId),
  });
}

/** Últimos movimientos de stock de un producto. */
export function useStockMovements(salonId: string, productId: string) {
  return useQuery({
    queryKey: stockKeys.movements(salonId, productId),
    queryFn: () => fetchStockMovements(salonId, productId),
    enabled: productId.length > 0,
  });
}

/** Productos en (o por debajo de) su mínimo de reposición. */
export function useLowStock(salonId: string) {
  return useQuery({
    queryKey: stockKeys.lowStock(salonId),
    queryFn: () => fetchLowStock(salonId),
  });
}

/** Lotes (movimientos de entrada) que caducan dentro de `days` días, o ya caducados. */
export function useExpiringSoon(salonId: string, days: number = DEFAULT_EXPIRING_SOON_DAYS) {
  return useQuery({
    queryKey: stockKeys.expiringSoon(salonId, days),
    queryFn: () => fetchExpiringSoon(salonId, days),
  });
}

/**
 * Registra un movimiento de stock. En éxito invalida TODO lo que depende del
 * stock del salón (`stockKeys.all`, que ya cubre products/movements/low-stock/
 * expiring-soon por prefijo de clave) más la lista de productos del catálogo
 * de gestión (`productKeys`, que muestra la misma columna `stock`).
 */
export function useRecordMovement(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordStockMovementInput): Promise<StockMovement> => {
      const result = await recordStockMovement(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: stockKeys.all(salonId) });
      void queryClient.invalidateQueries({ queryKey: productKeys.lists(salonId) });
    },
  });
}
