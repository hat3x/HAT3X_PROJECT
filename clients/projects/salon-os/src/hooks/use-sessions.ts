"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  closeSession,
  openSession,
  type CloseSessionReceipt,
  type OpenSessionResult,
} from "@/app/(dashboard)/arqueo/actions";
import {
  fetchOpenSession,
  fetchRecentSessions,
  fetchSessionActivity,
  sessionKeys,
} from "@/lib/queries/sessions";
import type { CloseSessionInput, OpenSessionInput } from "@/lib/validations/session";

/** La sesión de caja abierta del salón (o `null` si no hay ninguna). */
export function useOpenSession(salonId: string) {
  return useQuery({
    queryKey: sessionKeys.open(salonId),
    queryFn: () => fetchOpenSession(salonId),
  });
}

/**
 * Actividad viva de la sesión (cobros por método + nº de ventas). Solo consulta
 * cuando hay una sesión abierta; se refresca al vuelo para reflejar las ventas
 * que entran por el TPV mientras la caja está abierta.
 */
export function useSessionActivity(salonId: string, sessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.activity(salonId, sessionId ?? "none"),
    queryFn: () => fetchSessionActivity(salonId, sessionId!),
    enabled: sessionId !== null,
    refetchInterval: 30_000,
  });
}

/** Historial de arqueos (últimas sesiones cerradas del salón). */
export function useRecentSessions(salonId: string) {
  return useQuery({
    queryKey: sessionKeys.recent(salonId),
    queryFn: () => fetchRecentSessions(salonId),
  });
}

/** Abre la caja. Al completarse invalida las consultas de sesiones del salón. */
export function useOpenSessionMutation(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OpenSessionInput): Promise<OpenSessionResult> => {
      const result = await openSession(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all(salonId) });
    },
  });
}

/** Cierra la caja (arqueo). Invalida las consultas de sesiones del salón. */
export function useCloseSession(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseSessionInput): Promise<CloseSessionReceipt> => {
      const result = await closeSession(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all(salonId) });
    },
  });
}
