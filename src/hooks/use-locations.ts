"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLocation,
  setLocationActive,
  updateLocation,
} from "@/app/(dashboard)/ajustes/sedes/actions";
import { fetchLocations, locationKeys } from "@/lib/queries/locations";
import type { LocationInput } from "@/lib/validations/location";
import type { Location } from "@/types/database";

/** Lista de sedes del salón (activas e inactivas por defecto). */
export function useLocations(salonId: string, includeInactive = true) {
  return useQuery({
    queryKey: locationKeys.list(salonId, includeInactive),
    queryFn: () => fetchLocations(salonId, includeInactive),
  });
}

/** Crea una sede y refresca las listas. */
export function useCreateLocation(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LocationInput): Promise<Location> => {
      const result = await createLocation(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: locationKeys.lists(salonId),
      });
    },
  });
}

/** Actualiza una sede y refresca las listas. */
export function useUpdateLocation(salonId: string, locationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LocationInput): Promise<Location> => {
      const result = await updateLocation(locationId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: locationKeys.lists(salonId),
      });
    },
  });
}

/** Activa o desactiva una sede (baja lógica) y refresca las listas. */
export function useSetLocationActive(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: {
      locationId: string;
      active: boolean;
    }): Promise<Location> => {
      const result = await setLocationActive(
        variables.locationId,
        variables.active,
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: locationKeys.lists(salonId),
      });
    },
  });
}
