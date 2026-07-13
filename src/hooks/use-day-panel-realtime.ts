"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { appointmentKeys } from "@/lib/queries/appointments";

type RealtimeStatus = "connecting" | "connected" | "error";

/**
 * Suscripción Supabase Realtime a cambios en `appointments` para un salón.
 * Cuando llega cualquier cambio (INSERT / UPDATE / DELETE) invalida la cache
 * de TanStack Query, lo que dispara un re-fetch automático de la vista.
 *
 * Devuelve el estado de la conexión para que la UI pueda mostrarlo.
 */
export function useDayPanelRealtime(salonId: string): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // Ref para evitar que la limpieza de efectos doble-invoke en StrictMode
  // suscriba dos canales.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!salonId) return;

    const supabase = createClient();

    // Nombre único de canal para evitar colisiones si hay varios montajes.
    const channelName = `day-panel-appointments-${salonId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `salon_id=eq.${salonId}`,
        },
        () => {
          // Invalida todas las listas de citas del salón; el re-fetch es
          // automático gracias a TanStack Query.
          void queryClient.invalidateQueries({
            queryKey: appointmentKeys.all(salonId),
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
