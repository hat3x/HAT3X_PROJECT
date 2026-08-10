"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { fetchKdsItems, kdsKeys } from "@/lib/queries/kds";

/** Líneas de pedido activas del KDS para un salón. */
export function useKdsItems(salonId: string) {
  return useQuery({
    queryKey: kdsKeys.items(salonId),
    queryFn: () => fetchKdsItems(salonId),
  });
}

type RealtimeStatus = "connecting" | "connected" | "error";

/**
 * Suscripción Supabase Realtime a cambios en `order_items` para un salón.
 * Copia estructural de `useDayPanelRealtime` (mismo patrón de canal,
 * cleanup y estado de conexión) cambiando la tabla escuchada y la query
 * invalidada: cuando llega cualquier cambio (INSERT / UPDATE / DELETE)
 * invalida `kdsKeys.all(salonId)`, lo que dispara un re-fetch automático
 * del KDS.
 *
 * Devuelve el estado de la conexión para que la UI pueda mostrarlo.
 */
export function useKdsRealtime(salonId: string): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // Ref para evitar que la limpieza de efectos doble-invoke en StrictMode
  // suscriba dos canales.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!salonId) return;

    const supabase = createClient();

    // Nombre único de canal para evitar colisiones si hay varios montajes.
    const channelName = `kds-order-items-${salonId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `salon_id=eq.${salonId}`,
        },
        () => {
          // Invalida las líneas del KDS del salón; el re-fetch es
          // automático gracias a TanStack Query.
          void queryClient.invalidateQueries({
            queryKey: kdsKeys.all(salonId),
          });
        },
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
