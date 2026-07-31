"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Scissors, X } from "lucide-react";

import type { MemberRole } from "@/types/database";
import { cn } from "@/lib/utils";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";
import { useHasPos } from "@/components/providers/salon-features-provider";
import { useSector } from "@/components/providers/sector-provider";
import { ThemeToggle } from "@/components/theme-toggle";

/** Etiqueta legible del rol para el bloque de cuenta. */
const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Propietario",
  manager: "Gestor",
  staff: "Personal",
};

interface DashboardNavProps {
  /** Nombre del salón activo; cae a "Salon OS" si no hay uno resuelto. */
  brandName: string | null;
  /**
   * URL pública del logo del salón (white-label). Si existe, sustituye a la marca
   * genérica (cuadro violeta + tijeras); si es `null`, se muestra el fallback premium.
   */
  logoUrl?: string | null;
  /** Rol del usuario, para mostrar un descriptor discreto en la cuenta. */
  role: MemberRole | null;
  /** Si el usuario puede ver la sección de ajustes (owner/manager). */
  showSettings: boolean;
}

/**
 * Determina si un enlace está activo respecto a la ruta actual.
 * Coincidencia exacta o de sub-ruta (`/customers/123` activa `/customers`).
 */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegación principal del panel — barra superior premium y responsive.
 *
 * - **Glass:** barra fija (`sticky`) con `backdrop-blur` y fondo translúcido,
 *   de modo que el contenido se insinúa bajo ella al hacer scroll.
 * - **Jerarquía:** marca a la izquierda, secciones al centro, cuenta a la
 *   derecha. Estado activo con acento suave y `aria-current`.
 * - **Responsive real:** navegación horizontal en `lg+`; en pantallas menores
 *   se colapsa en un menú desplegable accesible con foco y cierre por ruta.
 *
 * Gating por entitlements: la lista de secciones se compone con
 * {@link buildDashboardNavItems} a partir del rol (`showSettings`) y del add-on
 * `pos` (leído del provider con {@link useHasPos}). Sin `pos`, Facturación se
 * OCULTA con gracia; la analítica de gestión permanece. Gate de presentación: el
 * gate de datos sigue vivo en el servidor de cada dominio.
 */
export function DashboardNav({
  brandName,
  logoUrl,
  role,
  showSettings,
}: DashboardNavProps): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hasPos = useHasPos();
  const sector = useSector();

  const items = buildDashboardNavItems({ showSettings, hasPos, sector });
  const brand = brandName?.trim() ? brandName : "Salon OS";
  const logo = logoUrl?.trim() ? logoUrl : null;

  // Cierra el menú móvil al cambiar de ruta (navegación completada).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquea el scroll del cuerpo mientras el panel móvil está abierto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center gap-4">
        {/* Marca */}
        <Link
          href="/dashboard"
          className="group flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {logo ? (
            // Logo del salón (white-label). Alto fijo (h-9) = sin salto de layout;
            // `object-contain` respeta el aspecto y `alt` lleva el nombre para SR.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={brand}
              className="h-9 w-auto max-w-[9.5rem] rounded-lg object-contain transition-transform duration-200 ease-apple-out group-hover:scale-105"
            />
          ) : (
            <>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand transition-transform duration-200 ease-apple-out group-hover:scale-105"
                aria-hidden="true"
              >
                <Scissors className="h-4.5 w-4.5" />
              </span>
              <span className="hidden text-base font-semibold tracking-tight sm:inline-block">
                {brand}
              </span>
            </>
          )}
        </Link>

        {/* Navegación de escritorio */}
        <nav
          aria-label="Secciones del panel"
          className="ml-2 hidden flex-1 items-center gap-0.5 lg:flex"
        >
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ease-apple-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Cuenta (escritorio) */}
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {role !== null && (
            <span className="hidden text-sm text-muted-foreground xl:inline-block">
              {ROLE_LABEL[role]}
            </span>
          )}
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline-block">Salir</span>
            </button>
          </form>
        </div>

        {/* Disparador del menú móvil */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Panel móvil */}
      {open && (
        <div className="lg:hidden">
          {/* Velo para cerrar al tocar fuera */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-16 z-30 bg-foreground/10 backdrop-blur-[2px]"
          />
          <nav
            id="mobile-nav"
            aria-label="Secciones del panel"
            className="relative z-40 animate-fade-up border-t border-border/70 bg-background/95 backdrop-blur-xl"
          >
            <div className="container flex flex-col gap-1 py-4">
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors duration-200 ease-apple-out",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "bg-accent text-accent-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}

              <div className="my-2 h-px bg-border/70" />

              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-sm text-muted-foreground">Tema</span>
                <ThemeToggle />
              </div>

              <div className="flex items-center justify-between px-3">
                {role !== null && (
                  <span className="text-sm text-muted-foreground">{ROLE_LABEL[role]}</span>
                )}
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Salir</span>
                  </button>
                </form>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
