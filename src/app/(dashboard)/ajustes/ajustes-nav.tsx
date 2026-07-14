"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Clock, Receipt, Scissors, Store, Users } from "lucide-react";

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

  return (
    <nav
      aria-label="Secciones de ajustes"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:gap-1 md:overflow-x-visible md:px-0 md:pb-0"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
