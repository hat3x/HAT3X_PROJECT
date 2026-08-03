"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, User, X } from "lucide-react";

import type { MemberRole } from "@/types/database";
import { cn } from "@/lib/utils";
import { KairosMark } from "@/components/brand/kairos-mark";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";
import { useHasPos } from "@/components/providers/salon-features-provider";
import { useSector } from "@/components/providers/sector-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Propietario",
  manager: "Gestor",
  staff: "Personal",
};

/**
 * Determina si un enlace está activo respecto a la ruta actual.
 * Coincidencia exacta o de sub-ruta (`/customers/123` activa `/customers`).
 */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Clases base compartidas entre desktop y drawer.
const NAV_ITEM_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const NAV_ITEM_ACTIVE = "bg-accent text-accent-foreground shadow-xs";
const NAV_ITEM_IDLE = "text-muted-foreground hover:bg-accent/60 hover:text-foreground";
const GLASS_BG =
  "bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60";

interface AppSidebarProps {
  /** Nombre del salón activo; cae a "Kairos" si no hay uno resuelto. */
  brandName: string | null;
  /**
   * URL pública del logo del salón (white-label). Si existe, sustituye a la
   * marca genérica; si es `null`, se muestra el fallback con icono + nombre.
   */
  logoUrl?: string | null;
  /** Rol del usuario, para mostrar un descriptor discreto en la sección de cuenta. */
  role: MemberRole | null;
  /** Si el usuario puede ver la sección de ajustes (owner/manager). */
  showSettings: boolean;
}

/**
 * Sidebar de navegación principal — layout vertical premium con glass.
 *
 * - **Escritorio (lg+):** barra lateral izquierda fija (`sticky top-0 h-screen`)
 *   con marca arriba, ítems de nav en el centro (scrollable) y bloque de cuenta
 *   (rol · tema · salir) anclado abajo.
 * - **Móvil (< lg):** cabecera sticky con hamburguesa; al abrirse, aparece un
 *   drawer desde la izquierda (`animate-in slide-in-from-left`) con el mismo
 *   contenido. Cierra al cambiar de ruta o pulsar el backdrop.
 *
 * Delega toda la lógica de gating a {@link buildDashboardNavItems} sin cambiar
 * ningún parámetro ni comportamiento: mismo `showSettings`, `hasPos`, `sector`.
 */
export function AppSidebar({
  brandName,
  logoUrl,
  role,
  showSettings,
}: AppSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hasPos = useHasPos();
  const sector = useSector();

  const items = buildDashboardNavItems({ showSettings, hasPos, sector });
  const brand = brandName?.trim() ? brandName : "Kairos";
  const logo = logoUrl?.trim() ? logoUrl : null;

  // Cierra el drawer móvil al cambiar de ruta (navegación completada).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquea el scroll del cuerpo mientras el drawer móvil está abierto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // ── Fragmentos de UI reutilizados en desktop sidebar y mobile drawer ───────
  // React elements son objetos planos — definirlos como variables const en el
  // cuerpo del render no causa remounts (≠ definir componentes internos).

  const brandLink = (
    <Link
      href="/dashboard"
      onClick={() => setOpen(false)}
      className="group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={brand}
          className="h-9 w-auto max-w-[9rem] rounded-lg object-contain transition-transform duration-200 ease-apple-out group-hover:scale-105"
        />
      ) : (
        <>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand transition-transform duration-200 ease-apple-out group-hover:scale-105"
            aria-hidden="true"
          >
            <KairosMark className="h-4.5 w-4.5" />
          </span>
          <span className="truncate text-base font-semibold tracking-tight">{brand}</span>
        </>
      )}
    </Link>
  );

  const navItems = (
    <nav
      aria-label="Secciones del panel"
      className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(NAV_ITEM_BASE, active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const accountSection = (
    <div className="shrink-0 space-y-1 border-t border-border/70 px-3 py-3">
      {/* Fila: rol + theme toggle */}
      <div className="flex items-center justify-between px-3 py-1.5">
        {role !== null ? (
          <div className="flex min-w-0 items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {ROLE_LABEL[role]}
            </span>
          </div>
        ) : (
          <span />
        )}
        <ThemeToggle />
      </div>

      {/* Cierre de sesión */}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className={cn(NAV_ITEM_BASE, NAV_ITEM_IDLE, "w-full")}
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          <span>Salir</span>
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* ════════════ Desktop sidebar (lg+) ════════════ */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 lg:flex",
          GLASS_BG,
        )}
      >
        {/* Marca */}
        <div className="flex h-16 shrink-0 items-center border-b border-border/70 px-4">
          {brandLink}
        </div>

        {/* Ítems de navegación */}
        {navItems}

        {/* Cuenta (rol · tema · salir) */}
        {accountSection}
      </aside>

      {/* ════════════ Cabecera móvil (< lg) ════════════ */}
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-border/70 px-4 lg:hidden",
          GLASS_BG,
        )}
      >
        {brandLink}

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </header>

      {/* ════════════ Drawer móvil ════════════
           Siempre montado en DOM — transiciones CSS manejan apertura Y cierre
           suave (backdrop fade + panel slide-x). `pointer-events-none` bloquea
           interacciones cuando cerrado sin romper el stacking context.        */}
      <div
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          !open && "pointer-events-none",
        )}
      >
        {/* Backdrop — fade in/out, cierra al tocar fuera */}
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-foreground/10 backdrop-blur-[2px]",
            "transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Panel lateral — slide-in desde la izquierda, slide-out al cerrar */}
        <aside
          id="mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border/70 bg-background/95 backdrop-blur-xl",
            "transition-transform duration-300 ease-apple-out",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Cabecera del drawer: marca + botón cerrar */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/70 px-4">
            {brandLink}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Ítems de navegación */}
          {navItems}

          {/* Cuenta */}
          {accountSection}
        </aside>
      </div>
    </>
  );
}
