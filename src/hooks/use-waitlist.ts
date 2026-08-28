"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { addToWaitlist, setWaitlistStatus } from "@/app/(dashboard)/appointments/waitlist-actions";
import { matchWaitlist, type FreedSlot } from "@/lib/booking/waitlist";
import {
  fetchLiveWaitlist,
  fetchWaitlist,
  toCandidate,
  waitlistKeys,
  type WaitlistEntryWithCustomer,
} from "@/lib/queries/waitlist";
import type { WaitlistEntryInput } from "@/lib/validations/waitlist";
import type { WaitlistStatus } from "@/types/database";

/** Toda la lista (pantalla de gestión). */
export function useWaitlist(salonId: string) {
  return useQuery({
    queryKey: waitlistKeys.list(salonId),
    queryFn: () => fetchWaitlist(salonId),
    enabled: salonId.length > 0,
  });
}

/** Solo las entradas vivas (las que se consideran al liberarse un hueco). */
export function useLiveWaitlist(salonId: string) {
  return useQuery({
    queryKey: waitlistKeys.live(salonId),
    queryFn: () => fetchLiveWaitlist(salonId),
    enabled: salonId.length > 0,
  });
}

/**
 * A quién llamar por un hueco que acaba de quedar libre.
 *
 * El emparejamiento se hace en el cliente sobre la lista viva, que es pequeña
 * —son los pacientes de un salón esperando sitio, no un histórico— y así se
 * reutiliza `matchWaitlist`, la misma función probada sin base de datos, en vez
 * de reescribir las reglas en SQL y arriesgarse a que las dos versiones acaben
 * diciendo cosas distintas.
 *
 * `slot` a `null` mientras no haya hueco que cubrir (nadie ha cancelado nada).
 */
export function useWaitlistMatches(salonId: string, slot: FreedSlot | null) {
  const { data: live, ...rest } = useLiveWaitlist(salonId);

  const matches = useMemo(() => {
    if (slot === null || live === undefined) return [];
    const candidates = live.map(toCandidate);
    const ordered = matchWaitlist(slot, candidates, new Date());
    // Se devuelven las filas completas: quien atiende necesita el nombre y el
    // teléfono, no un identificador.
    const byId = new Map(live.map((entry) => [entry.id, entry]));
    return ordered
      .map((candidate) => byId.get(candidate.id))
      .filter((entry): entry is WaitlistEntryWithCustomer => entry !== undefined);
  }, [slot, live]);

  return { ...rest, data: matches };
}

function useInvalidate(salonId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: waitlistKeys.all(salonId) });
}

export function useAddToWaitlist(salonId: string) {
  const invalidate = useInvalidate(salonId);
  return useMutation({
    mutationFn: async (input: WaitlistEntryInput) => {
      const res = await addToWaitlist(input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useSetWaitlistStatus(salonId: string) {
  const invalidate = useInvalidate(salonId);
  return useMutation({
    mutationFn: async (vars: { entryId: string; status: WaitlistStatus }) => {
      const res = await setWaitlistStatus(vars.entryId, vars.status);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
