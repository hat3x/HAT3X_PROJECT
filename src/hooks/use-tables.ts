"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createTable,
  createZone,
  deleteTable,
  deleteZone,
  openTable,
  saveTablePosition,
  setTableStatus,
  updateTable,
  updateZone,
} from "@/app/(dashboard)/sala/actions";
import { createClient } from "@/lib/supabase/client";
import { fetchTableOrders, fetchTables, fetchZones, tableKeys } from "@/lib/queries/tables";
import type {
  OpenTableInput,
  SaveTablePositionInput,
  SetTableStatusInput,
  TableInput,
  ZoneInput,
} from "@/lib/validations/table";
import type { DiningTable, DiningZone, Order } from "@/types/database";

export function useZones(salonId: string) {
  return useQuery({ queryKey: tableKeys.zones(salonId), queryFn: () => fetchZones(salonId) });
}

export function useTables(salonId: string) {
  return useQuery({ queryKey: tableKeys.tables(salonId), queryFn: () => fetchTables(salonId) });
}

export function useTableOrders(salonId: string) {
  return useQuery({
    queryKey: tableKeys.openOrders(salonId),
    queryFn: () => fetchTableOrders(salonId),
  });
}

type RealtimeStatus = "connecting" | "connected" | "error";

/**
 * Suscripción Supabase Realtime al plano de sala: cambios en `dining_tables`
 * (estado/posición de mesas) y en `orders` (apertura/cobro de cuenta ligada
 * a una mesa) para un salón. Cualquier cambio invalida la cache de TanStack
 * Query, lo que dispara un re-fetch automático del plano.
 *
 * Devuelve el estado de la conexión para que la UI pueda mostrarlo.
 */
export function useTablesRealtime(salonId: string): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // Ref para evitar que la limpieza de efectos doble-invoke en StrictMode
  // suscriba dos canales.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!salonId) return;

    const supabase = createClient();

    // Nombre único de canal para evitar colisiones si hay varios montajes.
    const channelName = `sala-${salonId}`;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: tableKeys.all(salonId) });
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dining_tables",
          filter: `salon_id=eq.${salonId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `salon_id=eq.${salonId}`,
        },
        invalidate,
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("connected");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
      });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [salonId, queryClient]);

  return status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutaciones (Task 5): cada una desempaqueta el `ActionResult` de la server
// action (lanza si `ok:false`, TanStack Query lo expone como `error`) e
// invalida TODO `tableKeys.all(salonId)` al terminar — más simple que
// invalidar cada sub-key por separado y, a diferencia de `use-orders.ts`, aquí
// no hay un detalle por id que sobreviva a una mutación (zonas/mesas se leen
// siempre como listado completo). El plano también se refresca solo vía
// `useTablesRealtime` cuando el cambio lo dispara OTRO cliente; esta
// invalidación cubre el caso del propio autor de la mutación.
// ─────────────────────────────────────────────────────────────────────────────

function useInvalidateTables(salonId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tableKeys.all(salonId) });
}

/** Abre una mesa libre y crea su cuenta ({@link openTable}, operativa). */
export function useOpenTable(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (input: OpenTableInput): Promise<Order> => {
      const result = await openTable(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

/** Transiciona el estado de una mesa ({@link setTableStatus}, operativa). */
export function useSetTableStatus(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (input: SetTableStatusInput): Promise<DiningTable> => {
      const result = await setTableStatus(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

/** Guarda la posición de una mesa en el plano ({@link saveTablePosition}, gestión). */
export function useSaveTablePosition(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (input: SaveTablePositionInput): Promise<DiningTable> => {
      const result = await saveTablePosition(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Zonas — mismo patrón `{ id, input }` para editar que `use-menu.ts`
// (useUpdateCategory/useUpdateStation).
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateZone(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (input: ZoneInput): Promise<DiningZone> => {
      const result = await createZone(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateZone(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ZoneInput }): Promise<DiningZone> => {
      const result = await updateZone(id, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteZone(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (id: string): Promise<null> => {
      const result = await deleteZone(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesas
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateTable(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (input: TableInput): Promise<DiningTable> => {
      const result = await createTable(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateTable(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TableInput }): Promise<DiningTable> => {
      const result = await updateTable(id, input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteTable(salonId: string) {
  const invalidate = useInvalidateTables(salonId);
  return useMutation({
    mutationFn: async (id: string): Promise<null> => {
      const result = await deleteTable(id);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => void invalidate(),
  });
}
