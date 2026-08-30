"use client";
import Link from "next/link";
import { LayoutGrid, Boxes, Users, BellRing, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ENTRADAS = [
  { href: "/", etiqueta: "Resumen", Icono: LayoutGrid },
  { href: "/proyectos", etiqueta: "Proyectos", Icono: Boxes },
  { href: "/clientes", etiqueta: "Clientes", Icono: Users },
  { href: "/alertas", etiqueta: "Alertas", Icono: BellRing },
  { href: "/dinero", etiqueta: "Dinero", Icono: Wallet },
  { href: "/ajustes", etiqueta: "Ajustes", Icono: Settings },
] as const;

/**
 * Recibe `esPropietario` y `rutaActual` ya resueltos en servidor. Este
 * componente NO consulta la base de datos: un componente cliente no puede
 * decidir quién eres.
 */
export function BarraLateral({
  esPropietario,
  rutaActual,
}: {
  esPropietario: boolean;
  rutaActual: string;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className="cristal flex flex-col gap-1 p-3"
    >
      <div className="px-2 pb-3 text-sm font-bold tracking-widest">ATLAS</div>
      {ENTRADAS.map(({ href, etiqueta, Icono }) => {
        const activa =
          href === "/" ? rutaActual === "/" : rutaActual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              activa ? "font-semibold" : "opacity-70 hover:opacity-100"
            )}
            style={activa ? { background: "var(--cristal-fondo-denso)" } : undefined}
          >
            <Icono size={16} aria-hidden="true" />
            {etiqueta}
          </Link>
        );
      })}
      {esPropietario && (
        <span className="mt-auto px-2.5 pt-3 text-[11px] uppercase tracking-wider opacity-50">
          Propietario
        </span>
      )}
    </nav>
  );
}
