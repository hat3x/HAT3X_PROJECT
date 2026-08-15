import type { Metadata } from "next";
import { headers } from "next/headers";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { atributosTema } from "@/lib/tema/tokens";
import { BarraLateral } from "@/components/marco/BarraLateral";
import { Auroras } from "@/components/marco/Auroras";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — HAT3X",
  description: "Todo lo que HAT3X tiene en producción, en un solo sitio.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Un componente de servidor no tiene acceso a la URL: la inyecta el
  // middleware como cabecera para que la barra lateral marque la entrada activa.
  const rutaActual = headers().get("x-pathname") ?? "/";

  // Sin perfil (pantallas de entrada): tema por defecto y sin barra lateral.
  const tema = perfil?.tema ?? "oscuro";
  const paleta = perfil?.paleta ?? "zafiro";

  return (
    <html lang="es" {...atributosTema(tema, paleta)}>
      <body className="min-h-dvh">
        <Auroras />
        {perfil ? (
          <div className="flex min-h-dvh">
            <BarraLateral
              esPropietario={perfil.esPropietario}
              rutaActual={rutaActual}
            />
            <main className="min-w-0 flex-1 p-3 pl-0">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
