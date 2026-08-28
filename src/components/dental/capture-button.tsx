"use client";

import { useState } from "react";
import { Loader2, Radiation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useImagingAgentSettings, useUsableImagingDevices } from "@/hooks/use-imaging-devices";
import { useUploadPatientImage } from "@/hooks/use-patient-images";
import { AgentError, captureFromAgent } from "@/lib/imaging/agent-client";

/**
 * Disparar una radiografía desde la ficha del paciente (A1a).
 *
 * El gesto que la fase promete: elegir el equipo, disparar en el aparato, y que
 * la imagen aparezca en la ficha sin pasar por el explorador de archivos.
 *
 * ── SI NO HAY AGENTE, ESTE BOTÓN NO EXISTE ──────────────────────────────────
 * No se pinta en gris ni con un aviso. La mayoría de clínicas no tiene agente
 * instalado, y un botón permanentemente deshabilitado en la ficha de cada
 * paciente es ruido que alguien acabará pulsando para averiguar qué hace. Lo
 * mismo si hay agente pero ningún equipo activo: no hay nada que disparar.
 *
 * Los bytes vuelven al navegador y se suben desde aquí con la sesión que ya está
 * abierta — por eso el agente no necesita credenciales de Supabase.
 */

export interface CaptureButtonProps {
  salonId: string;
  customerId: string;
  /** Diente al que se adjudica la imagen. Ausente en panorámicas. */
  fdiCode?: number;
}

export function CaptureButton({
  salonId,
  customerId,
  fdiCode,
}: CaptureButtonProps): React.ReactElement | null {
  const { data: agent } = useImagingAgentSettings(salonId);
  const { data: devices } = useUsableImagingDevices(salonId);
  const uploadMutation = useUploadPatientImage(salonId, customerId);

  const [capturando, setCapturando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sin emparejamiento o sin equipos, no hay nada que ofrecer.
  if (agent === null || agent === undefined) return null;
  if (devices === undefined || devices.length === 0) return null;

  async function capturar(deviceId: string, modality: string): Promise<void> {
    if (agent === null || agent === undefined) return;
    setError(null);
    setCapturando(deviceId);

    try {
      const imagen = await captureFromAgent({
        port: agent.port,
        token: agent.pairingToken,
        deviceId,
        customerId,
        modality,
        ...(fdiCode === undefined ? {} : { fdiCode }),
      });

      // La Server Action de subida espera el mismo `FormData` que el formulario
      // manual: reutilizarlo evita una segunda ruta de entrada al expediente que
      // pudiera divergir en validaciones o en permisos.
      const formData = new FormData();
      formData.set(
        "file",
        new File([new Uint8Array(imagen.bytes)], imagen.filename, { type: imagen.mime }),
      );
      formData.set("customerId", customerId);
      formData.set("modality", modality);
      if (fdiCode !== undefined) formData.set("fdiCode", String(fdiCode));

      await uploadMutation.mutateAsync(formData);
    } catch (err) {
      // Si la captura falla, NO se sube nada: una imagen a medias en la ficha de
      // un paciente es peor que ninguna.
      setError(
        err instanceof AgentError || err instanceof Error
          ? err.message
          : "No se pudo capturar la imagen.",
      );
    } finally {
      setCapturando(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {devices.map((device) => (
          <Button
            key={device.id}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={capturando !== null}
            onClick={() => void capturar(device.id, device.modality)}
          >
            {capturando === device.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Radiation className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {capturando === device.id ? "Esperando la imagen…" : device.name}
          </Button>
        ))}
      </div>

      {capturando !== null && (
        <p className="text-xs text-muted-foreground">
          Dispara en el equipo. La imagen llegará sola.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
