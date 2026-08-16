import Link from "next/link";
import { Palette } from "lucide-react";

// Las demás secciones (llavero, usuarios) llegan con las tareas 14 y 15. Aquí
// solo se enseña lo que de verdad funciona: un enlace muerto es peor que un
// hueco honesto.
const SECCIONES = [
  {
    href: "/ajustes/apariencia",
    titulo: "Apariencia",
    descripcion: "Tema claro u oscuro y cinco paletas de cristal.",
    Icono: Palette,
  },
] as const;

export default function PaginaAjustes() {
  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          La configuración de Atlas.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECCIONES.map(({ href, titulo, descripcion, Icono }) => (
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
