import { Loader2 } from 'lucide-react';

// Splash a pantalla completa mientras se resuelve el salón (antes del login y de
// pintar la app). Es intencionadamente "sin marca": todavía no sabemos qué salón es.
export function SalonSplash({ message = 'Cargando…' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
