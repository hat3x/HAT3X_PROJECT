"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CAMERA_UNSUPPORTED_MESSAGE,
  cameraErrorMessage,
  normalizeScannedToken,
} from "@/lib/loyalty/scan";

/** Fase del lector: buscando un QR, o parado por un error accionable. */
type ScanState = { phase: "scanning" } | { phase: "error"; message: string };

interface CameraScanButtonProps {
  /**
   * Se invoca con el `qr_token` normalizado en cuanto la cámara decodifica un QR.
   * En el TPV se conecta al MISMO lookup que el campo de texto del panel, de modo
   * que la cámara es una alternativa de ENTRADA y el resultado se pinta en un solo
   * sitio (sin UI duplicada).
   */
  onToken: (qrToken: string) => void;
  /** Deshabilita el botón (p. ej. mientras hay una consulta en curso). */
  disabled?: boolean;
}

/**
 * Botón "Escanear con cámara" + lector QR del carné de fidelización.
 *
 * Alternativa por CÁMARA al lector de mano / entrada manual: abre un diálogo con
 * la vista de la cámara (trasera en tablet vía `facingMode: "environment"`, webcam
 * en equipos de sobremesa) y, al decodificar un QR, entrega el token vía
 * {@link CameraScanButtonProps.onToken} y cierra el lector.
 *
 * ── Permisos y cierre (requisito de la subtarea) ─────────────────────────────
 *  • La librería (`@zxing/browser`) se carga de forma perezosa (`import()`
 *    dinámico) solo al abrir el lector: no penaliza la carga inicial del TPV.
 *  • El permiso lo pide `getUserMedia` bajo el capó; cualquier fallo (denegado,
 *    sin cámara, ocupada, contexto no seguro) se traduce a un mensaje accionable
 *    con opción de reintentar, sin romper el TPV.
 *  • El stream se DETIENE siempre: al leer un QR, al cerrar el diálogo, al
 *    reintentar y al desmontar (limpieza del efecto → `controls.stop()`).
 *  • Radix Dialog aporta atrapado de foco, cierre con Escape y devolución del
 *    foco al botón disparador.
 */
export function CameraScanButton({
  onToken,
  disabled = false,
}: CameraScanButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScanState>({ phase: "scanning" });

  const videoRef = useRef<HTMLVideoElement>(null);
  // Evita relanzar el callback si ZXing entrega dos frames con el mismo código
  // antes de que la limpieza del efecto detenga el escaneo.
  const handledRef = useRef(false);
  // `onToken` en una ref para que el efecto de cámara NO dependa de su identidad
  // (si no, cada render reiniciaría el stream).
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const handleDecoded = useCallback((raw: string): void => {
    const token = normalizeScannedToken(raw);
    if (token === "") {
      setState({
        phase: "error",
        message: "El código leído no contiene un token válido.",
      });
      return;
    }
    onTokenRef.current(token);
    setOpen(false); // Cierra el lector; el resultado lo pinta el panel.
  }, []);

  // Cámara activa SOLO mientras el diálogo está abierto y en fase "scanning". Al
  // salir de "scanning" (leer un QR / error) o cerrar el diálogo, la limpieza del
  // efecto detiene el stream.
  const scanning = open && state.phase === "scanning";
  useEffect(() => {
    if (!scanning) return;

    const video = videoRef.current;
    if (video === null) return;

    if (
      typeof navigator === "undefined" ||
      navigator.mediaDevices?.getUserMedia === undefined
    ) {
      setState({ phase: "error", message: CAMERA_UNSUPPORTED_MESSAGE });
      return;
    }

    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    handledRef.current = false;

    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (result === undefined || handledRef.current) return;
            handledRef.current = true;
            controls?.stop();
            handleDecoded(result.getText());
          },
        );
        // Si el diálogo se cerró mientras se abría la cámara, corta ya el stream.
        if (cancelled) controls.stop();
      } catch (error) {
        if (!cancelled) {
          setState({ phase: "error", message: cameraErrorMessage(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [scanning, handleDecoded]);

  function onOpenChange(next: boolean): void {
    setOpen(next);
    if (next) setState({ phase: "scanning" }); // El efecto pedirá la cámara.
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 rounded-xl"
        disabled={disabled}
        onClick={() => onOpenChange(true)}
      >
        <Camera className="h-[1.15rem] w-[1.15rem]" />
        Escanear con cámara
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Escanear carné
            </DialogTitle>
            <DialogDescription>
              Apunta con la cámara al código QR de fidelización del cliente.
            </DialogDescription>
          </DialogHeader>

          {/* Región de estado para lectores de pantalla. */}
          <p aria-live="polite" className="sr-only">
            {state.phase === "scanning"
              ? "Cámara activa. Apunta al código QR del carné del cliente."
              : state.message}
          </p>

          {state.phase === "scanning" ? (
            <div className="space-y-3">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/70 bg-foreground/90 shadow-inner">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  aria-label="Vista previa de la cámara"
                  muted
                  autoPlay
                  playsInline
                />
                {/* Retícula de encuadre (decorativa). */}
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  aria-hidden
                >
                  <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                La primera vez, el navegador pedirá permiso para usar la cámara.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <CameraOff className="h-6 w-6" />
                </span>
                <p className="font-medium">No se pudo abrir la cámara</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {state.message}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => setState({ phase: "scanning" })}
                >
                  Reintentar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
