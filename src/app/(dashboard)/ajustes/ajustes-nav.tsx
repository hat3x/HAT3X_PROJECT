"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Blocks,
  Building2,
  Clock,
  Contrast,
  Palette,
  Receipt,
  ScanLine,
  Scissors,
  ShieldPlus,
  Store,
  Users,
} from "lucide-react";

import { useSector, useTerms } from "@/components/providers/sector-provider";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Building2;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/ajustes/sedes", label: "Sedes", icon: Building2 },
  { href: "/ajustes/servicios", label: "Servicios", icon: Scissors },
  { href: "/ajustes/personal", label: "Personal", icon: Users },
  { href: "/ajustes/horarios", label: "Horarios", icon: Clock },
  { href: "/ajustes/datos", label: "Datos del salón", icon: Store },
  { href: "/ajustes/fiscal", label: "Datos fiscales", icon: Receipt },
  { href: "/ajustes/marca", label: "Marca", icon: Palette },
  { href: "/ajustes/apariencia", label: "Apariencia", icon: Contrast },
  { href: "/ajustes/complementos", label: "Complementos", icon: Blocks },
];

/**
 * Navegación entre las secciones de ajustes.
 *
 * Responsive: en móvil se muestra como una fila desplazable horizontalmente;
 * en `md+` como una barra lateral vertical. Marca la sección activa con
 * `aria-current="page"` y un fondo de acento.
 */
export function AjustesNav(): React.ReactElement {
  const pathname = usePathname();
  const sector = useSector();
  const terms = useTerms();

  // Relabel de los ítems cuyo texto depende del sector activo (p. ej. "Servicios"
  // para peluquería vs. "Carta" para restauración); el resto de NAV_ITEMS
  // permanece intacto. Peluquería conserva el label literal "Datos del salón"
  // (identidad byte a byte); el resto de sectores usa `terms.business`.
  const items = NAV_ITEMS.map((item) => {
    if (item.href === "/ajustes/servicios") {
      return { ...item, label: terms.servicePlural };
    }
    if (item.href === "/ajustes/personal") {
      return { ...item, label: terms.professionalPlural };
    }
    if (item.href === "/ajustes/datos" && sector !== "peluqueria") {
      return { ...item, label: `Datos de la ${terms.business}` };
    }
    return item;
  });

  // "Mutuas y seguros" y "Equipos de imagen" solo tienen sentido en odontología
  // (baremos con aseguradoras; sensores y ortopantomógrafos) — se insertan justo
  // después de "Servicios" en vez de añadirse a NAV_ITEMS a secas, para no
  // mostrarlas en peluquería/restauración.
  if (sector === "odontologia") {
    const servicesIndex = items.findIndex((item) => item.href === "/ajustes/servicios");
    const insertAt = servicesIndex === -1 ? items.length : servicesIndex + 1;
    items.splice(
      insertAt,
      0,
      { href: "/ajustes/mutuas", label: "Mutuas y seguros", icon: ShieldPlus },
      { href: "/ajustes/equipos", label: "Equipos de imagen", icon: ScanLine },
    );
  }

  return (
    <nav
      aria-label="Secciones de ajustes"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:gap-1 md:overflow-x-visible md:px-0 md:pb-0"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-apple-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors duration-200 ease-apple-out",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
