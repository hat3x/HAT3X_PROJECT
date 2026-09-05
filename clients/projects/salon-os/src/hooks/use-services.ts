"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createService,
  deleteService,
  updateService,
} from "@/app/(dashboard)/ajustes/servicios/actions";
import { fetchServices, serviceKeys } from "@/lib/queries/services";
import type { ServiceInput } from "@/lib/validations/service";
import type { Service } from "@/types/database";

/** Catálogo de servicios con búsqueda; mantiene los datos previos al teclear. */
export function useServices(salonId: string, search: string) {
  return useQuery({
    queryKey: serviceKeys.list(salonId, search),
    queryFn: () => fetchServices(salonId, search),
    placeholderData: keepPreviousData,
  });
}

/** Crea un servicio y refresca las listas. */
export function useCreateService(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput): Promise<Service> => {
      const result = await createService(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceKeys.lists(salonId),
      });
    },
  });
}

/** Actualiza un servicio y refresca las listas. */
export function useUpdateService(salonId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput): Promise<Service> => {
      const result = await updateService(serviceId, input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceKeys.lists(salonId),
      });
    },
  });
}

/** Elimina un servicio y refresca las listas. */
export function useDeleteService(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serviceId: string): Promise<string> => {
      const result = await deleteService(serviceId);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return serviceId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceKeys.lists(salonId),
      });
    },
  });
}
