"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOperatory,
  setOperatoryActive,
} from "@/app/(dashboard)/ajustes/gabinetes/actions";
import { createClient } from "@/lib/supabase/client";

/** Gabinetes del salón, activos y desactivados. */
export interface Operatory {
  id: string;
  name: string;
  active: boolean;
}

export const operatoryKeys = {
  all: (salonId: string) => ["operatories", salonId] as const,
};

export function useOperatories(salonId: string) {
  return useQuery({
    queryKey: operatoryKeys.all(salonId),
    queryFn: async (): Promise<Operatory[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("operatory")
        .select("id, name, active")
        .eq("salon_id", salonId)
        .order("name", { ascending: true });
      if (error !== null) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Al crear o cambiar un gabinete se invalida TAMBIÉN la disponibilidad: el
 * primer gabinete cambia cómo se calculan los huecos, y dejar la agenda con la
 * respuesta anterior haría dudar de si el cambio se guardó.
 */
export function useCreateOperatory(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const r = await createOperatory(input);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: operatoryKeys.all(salonId) });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useSetOperatoryActive(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const r = await setOperatoryActive(input);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: operatoryKeys.all(salonId) });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}
