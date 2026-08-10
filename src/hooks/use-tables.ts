"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { fetchTableOrders, fetchTables, fetchZones, tableKeys } from "@/lib/queries/tables";

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
