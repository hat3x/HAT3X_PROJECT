"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateSalon } from "@/app/(dashboard)/ajustes/datos/actions";
import { salonSettingsKeys } from "@/lib/queries/salon-settings";
import type { SalonSettingsInput } from "@/lib/validations/salon";
import type { Salon } from "@/types/database";

/**
 * Actualiza los datos generales del salón y refresca su caché.
 *
 * Como en `useUpdateCustomer`, la mutación desenvuelve el `ActionResult` del
 * Server Action: lanza en error para que el formulario muestre el mensaje, y
 * en éxito siembra la caché con la fila devuelta.
 */
export function useUpdateSalon(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalonSettingsInput): Promise<Salon> => {
      const result = await updateSalon(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(salonSettingsKeys.detail(salonId), data);
    },
  });
}
