"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, User, X } from "lucide-react";

import type { MemberRole } from "@/types/database";
import { cn } from "@/lib/utils";
import { KairosMark } from "@/components/brand/kairos-mark";
import { buildDashboardNavItems, type NavItem } from "@/components/dashboard-nav-items";
import { useHasPos } from "@/components/providers/salon-features-provider";
import { useSector } from "@/components/providers/sector-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Propietario",
  manager: "Gestor",
  staff: "Personal",
};

/** Clave de localStorage para recordar si el rail está plegado entre sesiones. */
const COLLAPSE_STORAGE_KEY = "kairos:nav-collapsed";

/** Secciones de gestión → se anclan abajo del rail (como el mockup: analítica/ajustes al pie). */
const MANAGEMENT_HREFS = new Set(["/analitica", "/facturacion", "/arqueo", "/ajustes"]);
/** Secciones clínicas (odontología) → grupo propio, separado por un divisor. */
const CLINICAL_HREFS = new Set([
  "/odontograma",
  "/periodontograma",
  "/ortodoncia",
  "/planes",
  "/expediente",
]);

type NavGroup = "operativa" | "clinica" | "gestion";

function groupOf(href: string): NavGroup {
  if (MANAGEMENT_HREFS.has(href)) return "gestion";
  if (CLINICAL_HREFS.has(href)) return "clinica";
  return "operativa";
}

/**
 * Determina si un enlace está activo respecto a la ruta actual.
 * Coincidencia exacta o de sub-ruta (`/customers/123` activa `/customers`).
 */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Clases base compartidas entre desktop y drawer.
const NAV_ITEM_BASE =
  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
// Estado activo con los tokens que el white-label del tenant SÍ sobrescribe
// (--accent/--accent-foreground): así el color de marca del salón tiñe el acento.
const NAV_ITEM_ACTIVE = "bg-accent text-accent-foreground shadow-xs";
const NAV_ITEM_IDLE = "text-muted-foreground hover:bg-accent/60 hover:text-foreground";

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
 * Sidebar de navegación principal — rail "Liquid Glass" estilo Atlas.
 *
 * - **Escritorio (lg+):** rail lateral en cristal (`sticky top-0 h-screen`) con
 *   la marca arriba, ítems de nav agrupados (operativa · clínica · gestión) con
 *   pastilla de activo + indicador de acento, y bloque de cuenta abajo. Por
 *   defecto se muestra PLEGADO (solo iconos con tooltip), y puede expandirse a
 *   etiquetas con el botón inferior; la preferencia se recuerda en `localStorage`.
 * - **Móvil (< lg):** cabecera sticky con hamburguesa + drawer con el mismo
 *   contenido SIEMPRE completo (el plegado solo aplica a desktop).
 *
 * La selección de tema/paleta se trasladará a Ajustes (fase siguiente); de
 * momento el conmutador de tema vive en el pie del rail para no perder el
 * cambio claro/oscuro.
 */
export function AppSidebar({
  brandName,
  logoUrl,
  role,
  showSettings,
}: AppSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Por defecto PLEGADO (el rail de iconos que el usuario aprobó); expandible.
  const [collapsed, setCollapsed] = useState(true);
  // Habilita la transición de ancho SOLO tras el primer pintado (sin animación al cargar).
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const hasPos = useHasPos();
  const sector = useSector();

  const items = buildDashboardNavItems({ showSettings, hasPos, sector });
  const mainItems = items.filter((item) => groupOf(item.href) !== "gestion");
  const managementItems = items.filter((item) => groupOf(item.href) === "gestion");
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
        {/* Indicador de acento a la izquierda cuando está activo */}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-foreground"
          />
        ) : null}
        <Icon className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
        <span className={cn(compact && "sr-only")}>{item.label}</span>
      </Link>
    );
  };

  /** Lista de nav con un divisor cada vez que cambia el grupo (operativa|clínica). */
  const navList = (list: NavItem[], compact: boolean): React.ReactElement => {
    const rendered: React.ReactElement[] = [];
    let prevGroup: NavGroup | null = null;
    for (const item of list) {
      const group = groupOf(item.href);
      if (prevGroup !== null && group !== prevGroup) {
        rendered.push(
          <div
            key={`div-${item.href}`}
            role="separator"
            className={cn("my-2 h-px bg-border/70", compact ? "mx-3" : "mx-2")}
          />,
        );
      }
      rendered.push(navLink(item, compact));
      prevGroup = group;
    }
    return (
      <nav
        aria-label="Secciones del panel"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2"
      >
        {rendered}
      </nav>
    );
  };

  const footerBlock = (compact: boolean): React.ReactElement => (
    <div className="shrink-0 space-y-1 border-t border-border/70 px-3 py-3">
      {/* Gestión (analítica · facturación · arqueo · ajustes), anclada al pie */}
      {managementItems.length > 0 ? (
        <div className="mb-1 flex flex-col gap-0.5">
          {managementItems.map((item) => navLink(item, compact))}
        </div>
      ) : null}

      {/* Rol + conmutador de tema (el selector de paleta vivirá en Ajustes) */}
      <div
        className={cn(
          "flex items-center py-1.5",
          compact ? "justify-center px-0" : "justify-between px-3",
        )}
      >
        {role !== null && !compact ? (
          <div className="flex min-w-0 items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-xs font-medium text-muted-foreground">
              {ROLE_LABEL[role]}
            </span>
          </div>
        ) : !compact ? (
          <span />
        ) : null}
        <ThemeToggle className={cn(compact && "flex-col")} />
      </div>

      {/* Cierre de sesión */}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          title={compact ? "Salir" : undefined}
          className={cn(NAV_ITEM_BASE, NAV_ITEM_IDLE, "w-full", compact && "justify-center gap-0 px-0")}
        >
          <LogOut className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
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

        {navList(mainItems, collapsed)}

        {/* Botón de plegar/desplegar el rail */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Desplegar menú" : "Plegar menú"}
          title={collapsed ? "Desplegar menú" : "Plegar menú"}
          className={cn(
            "mx-3 mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-apple-out hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            collapsed && "justify-center gap-0 px-0",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
          )}
          {!collapsed ? <span>Plegar menú</span> : null}
        </button>

        {footerBlock(collapsed)}
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

          {navList(mainItems, false)}
          {footerBlock(false)}
        </aside>
      </div>
    </>
  );
}
