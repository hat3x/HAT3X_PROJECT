"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteImagingDevice,
  saveImagingAgentSettings,
  saveImagingDevice,
} from "@/app/(dashboard)/ajustes/equipos/actions";
import {
  fetchImagingAgentSettings,
  fetchImagingDevices,
  fetchUsableImagingDevices,
  imagingDeviceKeys,
} from "@/lib/queries/imaging-devices";
import type { ImagingDeviceInput } from "@/lib/validations/imaging-device";

/** Todos los equipos del salón (pantalla de ajustes). */
export function useImagingDevices(salonId: string) {
  return useQuery({
    queryKey: imagingDeviceKeys.list(salonId),
    queryFn: () => fetchImagingDevices(salonId),
    enabled: salonId.length > 0,
  });
}

/** Solo los utilizables (selector de captura en la ficha del paciente). */
export function useUsableImagingDevices(salonId: string) {
  return useQuery({
    queryKey: imagingDeviceKeys.usable(salonId),
    queryFn: () => fetchUsableImagingDevices(salonId),
    enabled: salonId.length > 0,
  });
}

/**
 * Emparejamiento con el agente de la clínica.
 *
 * `null` significa «todavía no hay agente emparejado», que es el estado normal
 * de casi todas: la pantalla lo trata como pendiente de configurar, no como
 * fallo.
 */
export function useImagingAgentSettings(salonId: string) {
  return useQuery({
    queryKey: imagingDeviceKeys.agent(salonId),
    queryFn: () => fetchImagingAgentSettings(salonId),
    enabled: salonId.length > 0,
  });
}

export function useSaveImagingAgentSettings(salonId: string) {
  const invalidate = useInvalidate(salonId);
  return useMutation({
    mutationFn: async (input: { port: number; token: string }) => {
      const res = await saveImagingAgentSettings(input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

function useInvalidate(salonId: string) {
  const queryClient = useQueryClient();
  // Invalida las DOS listas: activar o desactivar un equipo cambia la lista de
  // ajustes y también lo que ve el selector de captura.
  return () =>
    void queryClient.invalidateQueries({ queryKey: imagingDeviceKeys.all(salonId) });
}

export function useSaveImagingDevice(salonId: string) {
  const invalidate = useInvalidate(salonId);
  return useMutation({
    mutationFn: async (vars: { input: ImagingDeviceInput; deviceId?: string }) => {
      const res = await saveImagingDevice(vars.input, vars.deviceId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteImagingDevice(salonId: string) {
  const invalidate = useInvalidate(salonId);
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const res = await deleteImagingDevice(deviceId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
