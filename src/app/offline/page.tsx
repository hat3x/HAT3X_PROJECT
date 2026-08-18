import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión" };

/**
 * Página de respaldo offline. El service worker (`public/sw.js`) la cachea al
 * instalarse y la sirve cuando una navegación falla por falta de conexión.
 * Debe ser estática (prerenderizable) para poder cachearse. Kairos necesita
 * red para los datos, así que aquí solo se informa y se invita a reintentar.
 */
export default function OfflinePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sin conexión</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        No hay conexión a internet. Kairos necesita conexión para cargar tus
        datos. Vuelve a intentarlo cuando recuperes la señal.
      </p>
    </main>
  );
}
