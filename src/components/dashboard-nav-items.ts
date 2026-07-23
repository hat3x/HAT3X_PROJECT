/**
 * Catálogo y composición PURA de las secciones del panel — sin dependencias de
 * cliente ni de Next. Separado de `dashboard-nav.tsx` (que sí es `"use client"`)
 * para que la lógica delicada —qué se muestra según el ROL y los ADD-ONS— sea
 * testeable en aislamiento, igual que `metric-cards.ts` para los KPIs del panel.
 *
 * ── Gating por `pos` (TPV) ────────────────────────────────────────────────────
 * Facturación es una superficie de PAGO: sus facturas y tickets NACEN del TPV, así
 * que sin el add-on `pos` se OCULTA del nav (coherente con el panel y la analítica,
 * que ya ocultan los KPIs y gráficas de ingresos sin `pos`). La analítica de gestión
 * (citas, clientes, ocupación) NO depende de `pos` y permanece visible. Es gating de
 * PRESENTACIÓN: el gate de datos vive en el servidor de cada dominio.
 */
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Una sección navegable del panel: destino, etiqueta e icono. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Operativa diaria — SIEMPRE visible (no depende del rol ni de add-ons). El orden
 * refleja la jerarquía de uso: vista general y día, luego venta/caja, y por último
 * los maestros (clientes/productos). La Caja (TPV) y el Arqueo son superficies de
 * uso corriente y se mantienen aquí; el add-on `pos` gatea el REPORTING fiscal
 * (Facturación) y de ingresos, no la operativa de caja.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/day-panel", label: "Panel del día", icon: CalendarDays },
  { href: "/appointments", label: "Citas", icon: CalendarClock },
  { href: "/tpv", label: "Caja", icon: ShoppingBag },
  { href: "/arqueo", label: "Arqueo", icon: Wallet },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
];

/**
 * Analítica (rendimiento del salón por periodo). Materia de gestión → solo
 * owner/manager. NO depende de `pos`: aun sin TPV conserva la analítica de gestión
 * (ocupación de agenda), así que se muestra siempre que el rol lo permita.
 */
export const ANALITICA_ITEM: NavItem = {
  href: "/analitica",
  label: "Analítica",
  icon: BarChart3,
};

/**
 * Facturación (libro de facturas + histórico de tickets/ventas). Materia de gestión
 * Y superficie de PAGO: requiere `pos` (TPV) además del rol. Sin `pos` se oculta con
 * gracia (no hay libro que mostrar; el layout lo confirma como defensa en profundidad).
 */
export const FACTURACION_ITEM: NavItem = {
  href: "/facturacion",
  label: "Facturación",
  icon: FileText,
};

/** Ajustes del salón. Materia de gestión → solo owner/manager. */
export const SETTINGS_ITEM: NavItem = {
  href: "/ajustes",
  label: "Ajustes",
  icon: Settings,
};

/** Entradas del gate: rol de gestión y add-on `pos` contratado y activo. */
export interface NavGating {
  /** El usuario puede ver materia de gestión (owner/manager). */
  showSettings: boolean;
  /** El salón tiene el add-on `pos` (TPV) contratado y activo. */
  hasPos: boolean;
}

/**
 * Compone la lista de secciones del panel según el rol y los add-ons contratados:
 *
 *   · Operativa diaria (PRIMARY) → siempre.
 *   · Analítica y Ajustes        → solo owner/manager (`showSettings`).
 *   · Facturación                → owner/manager Y `pos`; sin TPV se OCULTA.
 *
 * Facturación se coloca entre Analítica y Ajustes (del «cómo va» al «papeleo»).
 * Puro y determinista → testeable sin render (`dashboard-nav-items.test.ts`).
 */
export function buildDashboardNavItems({
  showSettings,
  hasPos,
}: NavGating): NavItem[] {
  const items: NavItem[] = [...PRIMARY_NAV_ITEMS];

  if (showSettings) {
    items.push(ANALITICA_ITEM);
    if (hasPos) {
      items.push(FACTURACION_ITEM);
    }
    items.push(SETTINGS_ITEM);
  }

  return items;
}
