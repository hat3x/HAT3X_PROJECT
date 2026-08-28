"use client";

/**
 * Lienzo de firma manuscrita (A2).
 *
 * Captura el trazo con Pointer Events, que es la única API que trata igual a
 * lápiz, dedo y ratón — y que da la presión cuando el dispositivo la reporta.
 *
 * El componente NO decide si el trazo vale: eso lo dice `isMeaningfulSignature`,
 * que comparten el llamante y la server action, para que el botón de firmar y la
 * validación del servidor no puedan discrepar.
 *
 * Solo emite datos hacia arriba (`onChange`); no habla con la red ni con la BD.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { strokesToSvgPath, type SignaturePoint, type SignatureStroke } from "@/lib/dental/signature";

export interface SignaturePadProps {
  /** Se llama en cada cambio del trazo, incluido el borrado (lista vacía). */
  onChange: (strokes: SignatureStroke[]) => void;
  /** Bloquea la captura mientras se está guardando. */
  disabled?: boolean;
  /** Texto accesible del lienzo. */
  label?: string;
}

/** Alto del lienzo en píxeles CSS. El ancho lo da el contenedor. */
const PAD_HEIGHT = 160;

export function SignaturePad({
  onChange,
  disabled = false,
  label = "Firma del paciente",
}: SignaturePadProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const currentRef = useRef<SignatureStroke | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [hasInk, setHasInk] = useState(false);

  /** Redibuja el lienzo entero desde los trazos guardados. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const d = strokesToSvgPath(strokesRef.current);
    if (d === "") return;
    ctx.stroke(new Path2D(d));
  }, []);

  /**
   * Ajusta el buffer del lienzo a su tamaño real y a la densidad de pantalla.
   * Sin esto el trazo sale borroso en tableta, que es justo donde se va a firmar.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
      repaint();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [repaint]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): SignaturePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    startedAtRef.current ??= event.timeStamp;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // Un ratón reporta 0 o 0.5; se normaliza para no guardar ceros engañosos.
      p: event.pressure > 0 ? event.pressure : 0.5,
      t: Math.round(event.timeStamp - startedAtRef.current),
    };
  }

  function emit(): void {
    onChange(strokesRef.current.map((stroke) => [...stroke]));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    currentRef.current = [pointFrom(event)];
    strokesRef.current = [...strokesRef.current, currentRef.current];
    setHasInk(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (disabled || currentRef.current === null) return;
    currentRef.current.push(pointFrom(event));
    repaint();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (currentRef.current === null) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    currentRef.current = null;
    repaint();
    emit();
  }

  function handleClear(): void {
    strokesRef.current = [];
    currentRef.current = null;
    startedAtRef.current = null;
    setHasInk(false);
    repaint();
    emit();
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ height: PAD_HEIGHT, touchAction: "none" }}
        className={`w-full rounded-md border bg-background ${
          disabled ? "opacity-60" : "cursor-crosshair"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Firme con el dedo o con el lápiz dentro del recuadro.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled || !hasInk}
        >
          Borrar
        </Button>
      </div>
    </div>
  );
}
