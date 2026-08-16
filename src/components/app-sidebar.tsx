"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { KairosMark } from "@/components/brand/kairos-mark";
import { buildDashboardNavItems, type NavItem } from "@/components/dashboard-nav-items";
import { useHasPos } from "@/components/providers/salon-features-provider";
import { useSector } from "@/components/providers/sector-provider";
import type { MemberRole } from "@/types/database";

/** Clave de localStorage para recordar si el rail está plegado entre sesiones. */
const COLLAPSE_STORAGE_KEY = "kairos:nav-collapsed";

/**
 * Determina si un enlace está activo respecto a la ruta actual.
 * Coincidencia exacta o de sub-ruta (`/customers/123` activa `/customers`).
 */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Clase base de TODO botón/enlace del rail — misma altura, padding y radio,
// para que la separación entre iconos sea idéntica en todo el rail.
const NAV_ITEM_BASE =
  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
// Estado activo con tokens que el white-label SÍ sobrescribe → la marca del salón tiñe el acento.
const NAV_ITEM_ACTIVE = "bg-accent text-accent-foreground shadow-xs";
const NAV_ITEM_IDLE = "text-muted-foreground hover:bg-accent/60 hover:text-foreground";

interface AppSidebarProps {
  /** Nombre del salón activo; cae a "Kairos" si no hay uno resuelto. */
  brandName: string | null;
  /** URL pública del logo del salón (white-label). Si es `null`, se usa el fallback con marca. */
  logoUrl?: string | null;
  /** Rol del usuario (reservado; el descriptor de cuenta se mostrará en Ajustes). */
  role: MemberRole | null;
  /** Si el usuario puede ver la sección de ajustes (owner/manager). */
  showSettings: boolean;
}

/**
 * Sidebar de navegación principal — rail "Liquid Glass" estilo Atlas.
 *
 * - **Escritorio (lg+):** rail lateral en cristal (`sticky top-0 h-screen`) con
 *   la marca arriba, UNA lista de secciones en su orden natural (con divisores
 *   entre grupos operativa · clínica · gestión) y un pie uniforme (plegar ·
 *   tema · salir). Por defecto PLEGADO (iconos con tooltip), expandible a
 *   etiquetas; la preferencia se recuerda en `localStorage`.
 * - **Móvil (< lg):** cabecera sticky + drawer con el mismo contenido completo.
 *
 * El conmutador de tema es temporal aquí (un botón que cicla claro/oscuro/
 * sistema); el selector de tema + paleta se trasladará a Ajustes.
 */
export function AppSidebar({
  brandName,
  logoUrl,
  showSettings,
}: AppSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Por defecto PLEGADO (el rail de iconos aprobado); expandible.
  const [collapsed, setCollapsed] = useState(true);
  // Habilita la transición de ancho SOLO tras el primer pintado (sin animación al cargar).
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const hasPos = useHasPos();
  const sector = useSector();
  const items = buildDashboardNavItems({ showSettings, hasPos, sector });
  const brand = brandName?.trim() ? brandName : "Kairos";
  const logo = logoUrl?.trim() ? logoUrl : null;

  // Cierra el drawer móvil al cambiar de ruta (navegación completada).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Recupera la preferencia de plegado (por defecto rail plegado). Se aplica el
  // estado ANTES de habilitar la transición (rAF → `mounted`), sin animación al cargar.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "1");
    } catch {
      // localStorage puede no estar disponible (modo privado, etc.).
    }
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Sin persistencia si localStorage falla; el estado en memoria sigue funcionando.
      }
      return next;
    });
  }

  // Cierra el drawer si la ventana se ensancha a desktop (lg).
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const handleChange = (): void => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  // Bloquea el scroll del cuerpo mientras el drawer móvil está abierto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Drawer como diálogo: foco al abrir, Escape para cerrar, `inert` al cerrar.
  useEffect(() => {
    const node = drawerRef.current;
    if (node) {
      if (open) node.removeAttribute("inert");
      else node.setAttribute("inert", "");
    }
    if (!open) return;
    drawerCloseRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // ── Fábricas de elementos (no componentes), parametrizadas por `compact` ────

  const brandLink = (compact: boolean): React.ReactElement => (
    <Link
      href="/dashboard"
      onClick={() => setOpen(false)}
      aria-label={brand}
      className={cn(
        "group flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        compact ? "justify-center gap-0" : "gap-2.5",
      )}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={brand}
          className={cn(
            "rounded-xl object-contain transition-transform duration-200 ease-apple-out group-hover:scale-105",
            compact ? "h-10 w-10" : "h-10 w-auto max-w-[9rem]",
          )}
        />
      ) : (
        <>
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-primary-foreground shadow-brand transition-transform duration-200 ease-apple-out group-hover:scale-105"
            style={{
              backgroundImage:
                "linear-gradient(140deg, hsl(var(--primary)), hsl(var(--primary) / 0.72))",
            }}
            aria-hidden="true"
          >
            <KairosMark className="h-5 w-5" />
          </span>
          {!compact ? (
            <span className="truncate text-base font-semibold tracking-tight">{brand}</span>
          ) : null}
        </>
      )}
    </Link>
  );

  const navLink = (item: NavItem, compact: boolean): React.ReactElement => {
    const active = isActivePath(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={compact ? item.label : undefined}
        className={cn(
          NAV_ITEM_BASE,
          active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
          compact && "justify-center gap-0 px-0",
        )}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-foreground"
          />
        ) : null}
        <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
        <span className={cn(compact && "sr-only")}>{item.label}</span>
      </Link>
    );
  };

  /** Lista de nav COMPLETA en orden natural, con separación UNIFORME (sin divisores). */
  const navList = (compact: boolean): React.ReactElement => (
    <nav
      aria-label="Secciones del panel"
      className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3"
    >
      {items.map((item) => navLink(item, compact))}
    </nav>
  );

  // Pie uniforme: plegar (solo desktop) · tema · salir — TODOS con NAV_ITEM_BASE.
  const footer = (compact: boolean, withCollapse: boolean): React.ReactElement => (
    <div className="flex shrink-0 flex-col gap-1 border-t border-border/70 px-3 py-3">
      {withCollapse ? (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={compact ? "Desplegar menú" : "Plegar menú"}
          title={compact ? "Desplegar menú" : "Plegar menú"}
          className={cn(NAV_ITEM_BASE, NAV_ITEM_IDLE, compact && "justify-center gap-0 px-0")}
        >
          {compact ? (
            <ChevronsRight className="h-6 w-6 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          <span className={cn(compact && "sr-only")}>Plegar menú</span>
        </button>
      ) : null}

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          title={compact ? "Salir" : undefined}
          className={cn(NAV_ITEM_BASE, NAV_ITEM_IDLE, "w-full", compact && "justify-center gap-0 px-0")}
        >
          <LogOut className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span className={cn(compact && "sr-only")}>Salir</span>
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* ════════════ Desktop rail (lg+) — Liquid Glass ════════════ */}
      <aside
        className={cn(
          "cristal sticky top-0 z-10 hidden h-screen shrink-0 flex-col lg:flex",
          mounted && "transition-[width] duration-300 ease-apple-out",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-border/50",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          {brandLink(collapsed)}
        </div>

        {navList(collapsed)}
        {footer(collapsed, true)}
      </aside>

      {/* ════════════ Cabecera móvil (< lg) ════════════ */}
      <header className="cristal sticky top-0 z-40 flex h-16 shrink-0 items-center px-4 lg:hidden">
        {brandLink(false)}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </header>

      {/* ════════════ Drawer móvil ════════════ */}
      <div
        aria-hidden={!open}
        className={cn("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")}
      >
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-foreground/10 backdrop-blur-[2px] transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          ref={drawerRef}
          id="mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className={cn(
            "cristal cristal-densa absolute inset-y-0 left-0 flex w-72 flex-col",
            "transition-transform duration-300 ease-apple-out",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-4">
            {brandLink(false)}
            <button
              ref={drawerCloseRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {navList(false)}
          {footer(false, false)}
        </aside>
      </div>
    </>
  );
}
