"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deletePatientImage, uploadPatientImage } from "@/app/(dashboard)/expediente/actions";
import { fetchPatientImages, imageKeys } from "@/lib/queries/patient-images";

/** Lista de imágenes/radiografías de un paciente, más recientes primero. */
export function usePatientImages(salonId: string, customerId: string) {
  return useQuery({
    queryKey: imageKeys.list(salonId, customerId),
    queryFn: () => fetchPatientImages(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

/**
 * Sube una imagen/radiografía clínica. Recibe el `FormData` completo (con la
 * clave `file` y el resto de campos) tal cual lo espera la Server Action.
 * Invalida la lista del paciente en éxito.
 */
export function useUploadPatientImage(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await uploadPatientImage(formData);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: imageKeys.list(salonId, customerId),
      });
    },
  });
}

/** Borra una imagen/radiografía (Storage + fila). Invalida la lista en éxito. */
export function useDeletePatientImage(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const result = await deletePatientImage(imageId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: imageKeys.list(salonId, customerId),
      });
    },
  });
}
