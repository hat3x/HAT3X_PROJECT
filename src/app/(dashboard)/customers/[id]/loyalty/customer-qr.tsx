"use client";

import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CustomerQrProps {
  /** Nombre del cliente, solo para la etiqueta accesible del QR. */
  name: string;
  /** Token de fidelización que codifica el QR (lo que lee el TPV). */
  qrToken: string;
}

/** Nombre de archivo seguro para la descarga del PNG. */
function safeFileName(token: string): string {
  const slug = token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `qr-fidelizacion-${slug === "" ? "cliente" : slug}.png`;
}

/**
 * Tarjeta con el QR de fidelización del cliente. El QR codifica el `qr_token`
 * en crudo —exactamente lo que espera `lookupByQr` / `verify-visit`— sobre una
 * placa blanca (siempre legible en claro y oscuro). Añade copiar el token y
 * descargar el QR como PNG. Es el único fragmento que requiere navegador.
 */
export function CustomerQr({ name, qrToken }: CustomerQrProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copyToken = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(qrToken);
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Portapapeles no disponible (contexto no seguro): no bloqueamos la UI.
    }
  }, [qrToken]);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = safeFileName(qrToken);
    link.click();
  }, [qrToken]);

  return (
    <Card className="overflow-hidden lg:sticky lg:top-24">
      <CardHeader className="border-b border-border/60 bg-accent/40">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ScanLine className="h-5 w-5 text-primary" />
          Carné de fidelización
        </CardTitle>
        <CardDescription>
          Escanéalo en el TPV para sumar puntos y aplicar recompensas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 pt-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <QRCodeCanvas
            ref={canvasRef}
            value={qrToken}
            size={188}
            bgColor="#ffffff"
            fgColor="#1a1625"
            level="M"
            marginSize={1}
            role="img"
            aria-label={`Código QR de fidelización de ${name}`}
          />
        </div>

        <div className="w-full space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Token
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border/70 bg-muted/50 px-3 py-2 font-mono text-sm">
              {qrToken}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={copyToken}
              aria-label={copied ? "Token copiado" : "Copiar token"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <span aria-live="polite" className="sr-only">
            {copied ? "Token copiado al portapapeles" : ""}
          </span>
        </div>

        <Button variant="secondary" className="w-full" onClick={downloadPng}>
          <Download className="mr-2 h-4 w-4" />
          Descargar QR (PNG)
        </Button>
      </CardContent>
    </Card>
  );
}
