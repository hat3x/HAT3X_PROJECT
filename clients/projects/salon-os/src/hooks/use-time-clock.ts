"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clockIn, clockOut } from "@/app/(dashboard)/fichaje/actions";
import {
  fetchMyOpenEntry,
  fetchTimeClockReport,
  timeClockKeys,
  type TimeClockEntry,
} from "@/lib/queries/time-clock";

/** Fichaje abierto del usuario actual (null si no está dentro). */
export function useMyOpenEntry(
  salonId: string,
  userId: string,
  initialData?: TimeClockEntry | null,
) {
  return useQuery({
    queryKey: timeClockKeys.mine(salonId, userId),
    queryFn: () => fetchMyOpenEntry(salonId, userId),
    initialData,
  });
}

/** Informe de fichajes del salón en un rango (owner/manager). */
export function useTimeClockReport(salonId: string, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: timeClockKeys.report(salonId, fromISO, toISO),
    queryFn: () => fetchTimeClockReport(salonId, fromISO, toISO),
  });
}

/** Ficha entrada del usuario actual e invalida la caché de fichajes. */
export function useClockIn(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clockIn().then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timeClockKeys.all(salonId) });
    },
  });
}

/** Ficha salida del usuario actual e invalida la caché de fichajes. */
export function useClockOut(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clockOut().then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timeClockKeys.all(salonId) });
    },
  });
}
