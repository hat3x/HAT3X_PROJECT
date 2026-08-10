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
  Activity,
  BarChart3,
  BellRing,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Stethoscope,
  UtensilsCrossed,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

/** Una sección navegable del panel: destino, etiqueta e icono. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Operativa diaria — SIEMPRE visible (no depende del rol ni de add-ons). El orden
 * refleja la jerarquía de uso: vista general y día, luego citas y recordatorios,
 * luego venta/caja, y por último los maestros (clientes/productos). La Caja (TPV)
 * y el Arqueo son superficies de uso corriente y se mantienen aquí; el add-on
 * `pos` gatea el REPORTING fiscal (Facturación) y de ingresos, no la operativa de
 * caja. Recordatorios (recall de revisión) no depende del sector: vale para todos.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/day-panel", label: "Panel del día", icon: CalendarDays },
  { href: "/appointments", label: "Citas", icon: CalendarClock },
  { href: "/recordatorios", label: "Recordatorios", icon: BellRing },
  { href: "/tpv", label: "Caja", icon: ShoppingBag },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/fichaje", label: "Fichaje", icon: Clock },
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

/**
 * Arqueo de caja (recuento y cuadre del efectivo del día). Materia de gestión
 * sensible (movimientos de dinero) → solo owner/manager, como Analítica.
 */
export const ARQUEO_ITEM: NavItem = {
  href: "/arqueo",
  label: "Arqueo",
  icon: Wallet,
};

/** Ajustes del salón. Materia de gestión → solo owner/manager. */
export const SETTINGS_ITEM: NavItem = {
  href: "/ajustes",
  label: "Ajustes",
  icon: Settings,
};

/**
 * Odontograma (ficha dental). Solo visible para el sector odontología.
 * Permite acceder al mapa interactivo de dientes del paciente.
 */
export const ODONTOGRAMA_ITEM: NavItem = {
  href: "/odontograma",
  label: "Odontograma",
  icon: Stethoscope,
};

/**
 * Periodontograma (carta de sondaje periodontal). Solo visible para el sector
 * odontología, justo después de Odontograma: primero el mapa de dientes,
 * luego la exploración periodontal (6 sitios/diente) de ese mismo paciente.
 */
export const PERIODONTOGRAMA_ITEM: NavItem = {
  href: "/periodontograma",
  label: "Periodontograma",
  icon: Activity,
};

/**
 * Planes de tratamiento / presupuestos. Solo visible para el sector
 * odontología, justo después de Periodontograma: primero el mapa de dientes,
 * luego la exploración periodontal y, por último, el presupuesto/plan de
 * tratamiento derivado de ambos.
 */
export const PLANES_ITEM: NavItem = {
  href: "/planes",
  label: "Planes",
  icon: ClipboardList,
};

/**
 * Expediente clínico (consentimientos informados + imágenes/radiografías).
 * Solo visible para el sector odontología, justo después de Planes: primero
 * el mapa de dientes, la exploración periodontal y el presupuesto/plan, y por
 * último el expediente (consentimientos firmados + imágenes) que documenta
 * todo lo anterior.
 */
export const EXPEDIENTE_ITEM: NavItem = {
  href: "/expediente",
  label: "Expediente",
  icon: FolderOpen,
};

/**
 * Carta (backoffice de categorías/estaciones/productos/modificadores/combos).
 * Solo visible para el sector restauración, y solo para gestión (owner/manager):
 * es materia de gestión, igual que Odontograma lo es para odontología.
 */
export const CARTA_ITEM: NavItem = {
  href: "/carta",
  label: "Carta",
  icon: UtensilsCrossed,
};

/** Entradas del gate: rol de gestión, add-on `pos` contratado y activo, y sector. */
export interface NavGating {
  /** El usuario puede ver materia de gestión (owner/manager). */
  showSettings: boolean;
  /** El salón tiene el add-on `pos` (TPV) contratado y activo. */
  hasPos: boolean;
  /** Sector del salón activo; determina labels y disponibilidad. Por defecto "peluqueria". */
  sector?: SalonSector;
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
 *
 * ── Por sector ────────────────────────────────────────────────────────────────
 * Sector no implementado (`SECTOR_REGISTRY[sector].implemented === false`) →
 * cascarón: solo Panel + "Próximamente" (+ Ajustes si `showSettings`), ignorando
 * el resto del gating. Peluquería (o sin `sector`) devuelve la lista de siempre,
 * byte-idéntica. Otros sectores implementados relabelan "Clientes" al término
 * propio del sector (`config.terms.customerPlural`), p. ej. "Pacientes". Odontología
 * además inserta Odontograma y, justo detrás, Periodontograma, Planes y Expediente
 * (en ese orden) tras "Pacientes". Restauración inserta Carta (gestión de la carta:
 * categorías/estaciones/productos/combos) justo tras "Panel", solo si `showSettings`
 * (owner/manager); sin gestión no se añade (staff no ve Carta).
 */
export function buildDashboardNavItems({
  showSettings,
  hasPos,
  sector = "peluqueria",
}: NavGating): NavItem[] {
  const items: NavItem[] = [...PRIMARY_NAV_ITEMS];

  if (showSettings) {
    items.push(ANALITICA_ITEM);
    if (hasPos) {
      items.push(FACTURACION_ITEM);
    }
    items.push(ARQUEO_ITEM);
    items.push(SETTINGS_ITEM);
  }

  const config = SECTOR_REGISTRY[sector];
  if (!config.implemented) {
    const panel = items.find((item) => item.href === "/dashboard");
    if (panel === undefined) {
      throw new Error("buildDashboardNavItems: falta el item Panel (/dashboard)");
    }
    return [
      panel,
      { href: "/proximamente", label: "Próximamente", icon: Clock },
      ...(showSettings ? [SETTINGS_ITEM] : []),
    ];
  }

  if (sector === "peluqueria") return items;

  const withSectorLabels = items.map((item) =>
    item.href === "/customers"
      ? { ...item, label: config.terms.customerPlural }
      : item,
  );

  if (sector === "odontologia") {
    // Odontología: añadir Odontograma justo después de Pacientes, Periodontograma
    // justo después de Odontograma, Planes justo después de Periodontograma, y
    // Expediente justo después de Planes.
    const patientsIdx = withSectorLabels.findIndex((i) => i.href === "/customers");
    const insertAt = patientsIdx === -1 ? withSectorLabels.length : patientsIdx + 1;
    return [
      ...withSectorLabels.slice(0, insertAt),
      ODONTOGRAMA_ITEM,
      PERIODONTOGRAMA_ITEM,
      PLANES_ITEM,
      EXPEDIENTE_ITEM,
      ...withSectorLabels.slice(insertAt),
    ];
  }

  if (sector === "restauracion") {
    // "Carta" es gestión (owner/manager): solo si showSettings.
    return showSettings
      ? [...withSectorLabels.slice(0, 1), CARTA_ITEM, ...withSectorLabels.slice(1)]
      : withSectorLabels;
  }

  return withSectorLabels;
}
