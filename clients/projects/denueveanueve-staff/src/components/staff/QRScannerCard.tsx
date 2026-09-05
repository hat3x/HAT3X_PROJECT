import { useEffect, useState, useRef, useCallback } from 'react';
import { Camera, CameraOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRScannerCardProps {
  onScanSuccess: (qrToken: string) => void;
  onFallbackManual: () => void;
}

export function QRScannerCard({ onScanSuccess, onFallbackManual }: QRScannerCardProps) {
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied' | 'error'>('prompt');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const hasStartedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        if (state === 2) { // SCANNING
          await html5QrCodeRef.current.stop();
        }
      } catch {
        // ignore
      }
      try {
        html5QrCodeRef.current.clear();
      } catch {
        // ignore
      }
      html5QrCodeRef.current = null;
    }
    hasStartedRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach((t) => t.stop());
      setPermission('granted');

      const { Html5Qrcode } = await import('html5-qrcode');
      
      // Clean up any existing scanner
      await stopScanner();

      const scannerId = 'qr-reader';
      const el = document.getElementById(scannerId);
      if (!el) return;

      const scanner = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = scanner;
      setScanning(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScanSuccess(decodedText);
          stopScanner();
          setScanning(false);
        },
        () => {} // ignore scan failures
      );
    } catch (err: any) {
      hasStartedRef.current = false;
      if (err?.name === 'NotAllowedError') {
        setPermission('denied');
      } else {
        setPermission('error');
      }
    }
  }, [onScanSuccess, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  if (permission === 'denied') {
    return (
      <div className="rounded-xl bg-card border border-border p-6 text-center">
        <CameraOff className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Cámara no disponible</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Permite el acceso a la cámara en los ajustes de tu navegador.
        </p>
        <Button variant="outline" className="mt-4 border-border text-foreground" onClick={onFallbackManual}>
          Buscar manualmente
        </Button>
      </div>
    );
  }

  if (permission === 'error') {
    return (
      <div className="rounded-xl bg-card border border-border p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="font-semibold text-foreground">Error de cámara</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No se pudo acceder a la cámara del dispositivo.
        </p>
        <Button variant="outline" className="mt-4 border-border text-foreground" onClick={onFallbackManual}>
          Buscar manualmente
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {!scanning && (
        <div className="p-6 text-center">
          <Camera className="mx-auto mb-3 h-10 w-10 text-primary" />
          <h3 className="font-semibold text-foreground">Escanear código QR</h3>
          <p className="mt-1 text-sm text-muted-foreground mb-4">
            Apunta la cámara al QR del cliente
          </p>
          <Button onClick={startScanner} className="gradient-gold text-primary-foreground shadow-gold h-12 px-8">
            <Camera className="mr-2 h-5 w-5" />
            Abrir cámara
          </Button>
        </div>
      )}
      <div
        id="qr-reader"
        ref={scannerRef}
        className={scanning ? 'w-full' : 'hidden'}
      />
      {scanning && (
        <div className="p-3 text-center">
          <p className="text-xs text-muted-foreground animate-pulse">Buscando código QR...</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-muted-foreground"
            onClick={() => { stopScanner(); setScanning(false); }}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
