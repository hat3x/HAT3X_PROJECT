import Link from "next/link";
import { Palette, KeyRound, Users } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";

// Solo se enseña lo que de verdad funciona: un enlace muerto es peor que un
// hueco honesto.
const SECCIONES = [
  {
    href: "/ajustes/apariencia",
    titulo: "Apariencia",
    descripcion: "Tema claro u oscuro y cinco paletas de cristal.",
    Icono: Palette,
    soloPropietario: false,
  },
  {
    href: "/ajustes/credenciales",
    titulo: "Llavero",
    descripcion: "Las claves de los servicios, cifradas. Alta, rotación y borrado.",
    Icono: KeyRound,
    soloPropietario: true,
  },
  {
    href: "/ajustes/usuarios",
    titulo: "Usuarios y permisos",
    descripcion: "Quién llega a qué proyecto, y como editor o como lector.",
    Icono: Users,
    soloPropietario: true,
  },
] as const;

export default async function PaginaAjustes() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  const esPropietario = perfil?.esPropietario ?? false;
  // El gating se decide AQUÍ, en servidor. La página del llavero además devuelve
  // 404 por su cuenta: esto solo evita enseñar una puerta cerrada.
  const visibles = SECCIONES.filter((s) => !s.soloPropietario || esPropietario);

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          La configuración de Atlas.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {visibles.map(({ href, titulo, descripcion, Icono }) => (
          <Link
            key={href}
            href={href}
            className="cristal flex items-start gap-3 p-4 transition-transform hover:scale-[1.01]"
          >
            <Icono size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <span className="block font-medium">{titulo}</span>
              <span className="block text-sm" style={{ color: "var(--texto-tenue)" }}>
                {descripcion}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
