"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addServiceMaterial,
  removeServiceMaterial,
  updateServiceMaterialQty,
  type AddServiceMaterialInput,
} from "@/app/(dashboard)/ajustes/servicios/material-actions";
import {
  fetchServiceMaterials,
  serviceMaterialKeys,
  type ServiceMaterialWithProduct,
} from "@/lib/queries/service-material";
import type { ServiceMaterial } from "@/types/database";

/** Escandallo (materiales que consume) de un servicio. */
export function useServiceMaterials(salonId: string, serviceId: string) {
  return useQuery({
    queryKey: serviceMaterialKeys.list(salonId, serviceId),
    queryFn: () => fetchServiceMaterials(salonId, serviceId),
    enabled: serviceId.length > 0,
  });
}

/** Añade un material al escandallo del servicio. */
export function useAddServiceMaterial(salonId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddServiceMaterialInput,
    ): Promise<ServiceMaterial> => {
      const result = await addServiceMaterial(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceMaterialKeys.list(salonId, serviceId),
      });
    },
  });
}

/** Quita un material del escandallo del servicio. */
export function useRemoveServiceMaterial(salonId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const result = await removeServiceMaterial(id);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceMaterialKeys.list(salonId, serviceId),
      });
    },
  });
}

export interface UpdateServiceMaterialQtyInput {
  id: string;
  quantity: number;
}

/** Actualiza la cantidad consumida de una línea del escandallo. */
export function useUpdateServiceMaterialQty(salonId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: UpdateServiceMaterialQtyInput,
    ): Promise<ServiceMaterial> => {
      const result = await updateServiceMaterialQty(input.id, input.quantity);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: serviceMaterialKeys.list(salonId, serviceId),
      });
    },
  });
}

export type { ServiceMaterialWithProduct };
