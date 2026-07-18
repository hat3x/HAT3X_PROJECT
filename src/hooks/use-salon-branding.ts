"use client";

import { useMutation } from "@tanstack/react-query";

import {
  deleteSalonLogo,
  saveSalonColors,
  saveSalonLogo,
} from "@/app/(dashboard)/ajustes/marca/actions";
import type { SalonColorsInput } from "@/lib/salon-branding/server";
import type { SalonBranding } from "@/types/database";

/**
 * Mutaciones de la marca (white-label) del salón activo.
 *
 * Mismo patrón que `use-salon-settings`: cada hook desenvuelve el `ActionResult`
 * del Server Action —lanza en error para que el formulario muestre el mensaje
 * (incluida la denegación de permiso), devuelve la fila en éxito—. A diferencia
 * de aquéllos, NO siembran caché de React Query: la marca se scopea al salón
 * activo en servidor y hoy solo la lee esta página (que ya se revalida en cada
 * escritura). El formulario refleja al instante la fila devuelta en `onSuccess`.
 */

/** Guarda los colores de marca (principal y acento). */
export function useSaveSalonColors() {
  return useMutation({
    mutationFn: async (input: SalonColorsInput): Promise<SalonBranding> => {
      const result = await saveSalonColors(input);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/** Sube o reemplaza el logo del salón; devuelve la marca actualizada. */
export function useUploadSalonLogo() {
  return useMutation({
    mutationFn: async (file: File): Promise<SalonBranding> => {
      const result = await saveSalonLogo(file);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}

/** Quita el logo; devuelve la marca resultante (o `null` si no existía fila). */
export function useRemoveSalonLogo() {
  return useMutation({
    mutationFn: async (): Promise<SalonBranding | null> => {
      const result = await deleteSalonLogo();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
}
