import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { atributosTema } from "@/lib/tema/tokens";
import { BarraLateral } from "@/components/marco/BarraLateral";
import { Fichaje, type EnCurso } from "@/components/marco/Fichaje";
import { Auroras } from "@/components/marco/Auroras";
import { RegistrarSW } from "@/components/marco/RegistrarSW";
import { fichajeEnCurso } from "@/lib/db/fichajes";
import { listarProyectos } from "@/lib/db/proyectos";
import { listarClientes } from "@/lib/db/clientes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — HAT3X",
  description: "Todo lo que HAT3X tiene en producción, en un solo sitio.",
  manifest: "/manifest.webmanifest",
  // En iOS esto es lo que hace que «Añadir a inicio» abra Atlas a pantalla
  // completa — y ahí no es un lujo: sin instalar, iOS no da push.
  appleWebApp: { capable: true, title: "Atlas", statusBarStyle: "black-translucent" },
  icons: { icon: "/iconos/atlas-192.png", apple: "/iconos/atlas-192.png" },
};

// En Next 14 `themeColor` va aquí, no en `metadata`: puesto allí avisa en cada build.
export const viewport: Viewport = {
  themeColor: "#050810",
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

  let enCurso: EnCurso | null = null;
  let proyectos: { id: string; nombre: string }[] = [];
  let clientes: { id: string; nombre: string }[] = [];
  if (perfil) {
    const [f, ps, cs] = await Promise.all([
      fichajeEnCurso(sb),
      listarProyectos(sb),
      listarClientes(sb),
    ]);
    // La etiqueta se compone aquí, una vez, y viaja como texto: el componente
    // cliente no tiene por qué saber de proyectos ni de clientes.
    enCurso = f
      ? {
          id: f.id,
          inicio: f.inicio,
          etiqueta:
            [f.proyectoNombre, f.clienteNombre].filter(Boolean).join(" · ") || "Sin asignar",
        }
      : null;
    proyectos = ps.map((p) => ({ id: p.id, nombre: p.nombre }));
    clientes = cs.map((c) => ({ id: c.id, nombre: c.nombre }));
  }

  return (
    <html lang="es" {...atributosTema(tema, paleta)}>
      <body className="min-h-dvh">
        <Auroras />
        <RegistrarSW />
        {perfil ? (
          <div className="flex min-h-dvh">
            <div className="m-3 flex w-56 shrink-0 flex-col gap-3">
              <BarraLateral esPropietario={perfil.esPropietario} rutaActual={rutaActual} />
              <Fichaje enCurso={enCurso} proyectos={proyectos} clientes={clientes} />
            </div>
            <main className="min-w-0 flex-1 p-3 pl-0">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
