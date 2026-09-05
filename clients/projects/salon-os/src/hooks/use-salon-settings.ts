"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateSalon } from "@/app/(dashboard)/ajustes/datos/actions";
import { updateSalonFiscal } from "@/app/(dashboard)/ajustes/fiscal/actions";
import { salonSettingsKeys } from "@/lib/queries/salon-settings";
import type { SalonFiscalInput } from "@/lib/validations/salon-fiscal";
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

/**
 * Actualiza los datos fiscales del salón (NIF/CIF, razón social y domicilio
 * fiscal) y refresca su caché.
 *
 * Escribe sobre la misma fila `salons` que {@link useUpdateSalon}, por lo que
 * comparte la clave de caché `detail(salonId)`: al sembrarla con la fila
 * devuelta, el formulario de datos generales queda coherente.
 */
export function useUpdateSalonFiscal(salonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalonFiscalInput): Promise<Salon> => {
      const result = await updateSalonFiscal(input);
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
