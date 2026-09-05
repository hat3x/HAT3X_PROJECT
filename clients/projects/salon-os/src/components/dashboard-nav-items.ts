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
import type { ComponentType, SVGProps } from "react";
import {
  Armchair,
  BarChart3,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChefHat,
  Clock,
  ConciergeBell,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";

import {
  BracesIcon,
  PerioIcon,
  ToothIcon,
} from "@/components/brand/dental-icons";
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

/**
 * Componente de icono de una sección. Acepta tanto los iconos de Lucide como
 * los SVG dentales a medida (`@/components/brand/dental-icons`): ambos aceptan
 * `className`/`aria-hidden` (SVGProps).
 */
export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** Una sección navegable del panel: destino, etiqueta e icono. */
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
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
  icon: ToothIcon,
};

/**
 * Periodontograma (carta de sondaje periodontal). Solo visible para el sector
 * odontología, justo después de Odontograma: primero el mapa de dientes,
 * luego la exploración periodontal (6 sitios/diente) de ese mismo paciente.
 */
export const PERIODONTOGRAMA_ITEM: NavItem = {
  href: "/periodontograma",
  label: "Periodontograma",
  icon: PerioIcon,
};

/**
 * Ortodoncia (seguimiento de tratamientos ortodóncicos). Solo visible para el
 * sector odontología, justo después de Periodontograma: primero el mapa de
 * dientes, luego la exploración periodontal y, a continuación, el
 * seguimiento ortodóncico de ese mismo paciente.
 */
export const ORTODONCIA_ITEM: NavItem = {
  href: "/ortodoncia",
  label: "Ortodoncia",
  icon: BracesIcon,
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

/**
 * Mostrador (venta de mostrador: comanda + cobro). Solo visible para el
 * sector restauración, y para TODOS los miembros (incluido staff): a
 * diferencia de Carta (gestión), Mostrador es operativa de venta del día a día,
 * como la Caja lo es para el resto de sectores.
 */
export const MOSTRADOR_ITEM: NavItem = {
  href: "/mostrador",
  label: "Mostrador",
  icon: ConciergeBell,
};

/**
 * Cocina (KDS — Kitchen Display System: comandas por estación en tiempo real).
 * Solo visible para el sector restauración, y para TODOS los miembros (incluido
 * staff): igual que Mostrador, es operativa de venta del día a día, no gestión.
 */
export const COCINA_ITEM: NavItem = {
  href: "/cocina",
  label: "Cocina",
  icon: ChefHat,
};

/**
 * Sala (plano de mesas: comensales, comanda, cobro). Solo visible para el
 * sector restauración, y para TODOS los miembros (incluido staff): igual que
 * Mostrador y Cocina, es operativa de venta del día a día, no gestión. En
 * restauración se vende en Mostrador/Sala, por lo que "Caja" (`/tpv`) se
 * retira del menú para este sector.
 */
export const SALA_ITEM: NavItem = {
  href: "/sala",
  label: "Sala",
  icon: Armchair,
};

/** Entradas del gate: rol de gestión, add-on `pos` contratado y activo, y sector. */
export interface NavGating {
  /**
   * El usuario puede ver el enlace a AJUSTES.
   *
   * Ojo: NO implica gestión. Desde que `staff` entra a Ajustes para su propio
   * horario, esto es cierto para él — y sin embargo no puede ver la analítica
   * de la clínica. Eran la misma bandera y por eso se destaparon de golpe.
   */
  showSettings: boolean;
  /**
   * El usuario puede ver materia de GESTIÓN: analítica, facturación y arqueo.
   * Owner/manager. Es dinero del negocio, no operativa del día.
   *
   * Por defecto `false`: quien no lo pida explícitamente no la ve. Abrirla por
   * descuido es peor que ocultarla de más.
   */
  showManagement?: boolean;
  /** El salón tiene el add-on `pos` (TPV) contratado y activo. */
  hasPos: boolean;
  /** Sector del salón activo; determina labels y disponibilidad. Por defecto "peluqueria". */
  sector?: SalonSector;
}

/**
 * Compone la lista de secciones del panel según el rol y los add-ons contratados:
 *
 *   · Operativa diaria (PRIMARY) → siempre.
 *   · Analítica, Facturación y Arqueo → solo owner/manager (`showManagement`).
 *   · Ajustes                     → quien tenga alguna sección (`showSettings`).
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
 * además inserta Odontograma y, justo detrás, Periodontograma y Ortodoncia (en ese
 * orden) tras "Pacientes". Planes y Expediente NO van en el rail: son pestañas de la
 * ficha del paciente (/customers/[id]?tab=…). Restauración inserta Mostrador (venta de
 * mostrador: comanda + cobro) justo tras "Panel", SIEMPRE (todos los miembros,
 * staff incluido) — es operativa de venta del día a día, como la Caja lo es
 * para el resto de sectores. Justo detrás, Sala (plano de mesas: comensales,
 * comanda, cobro) también SIEMPRE (todos los miembros, staff incluido) —
 * misma naturaleza operativa que Mostrador. Justo detrás, Cocina (KDS:
 * comandas por estación en tiempo real) también SIEMPRE (todos los miembros,
 * staff incluido) — misma naturaleza operativa que Mostrador y Sala. Por
 * último, Carta (gestión de la carta: categorías/estaciones/productos/combos)
 * solo si `showSettings` (owner/manager); sin gestión no se añade (staff no
 * ve Carta, pero sí Mostrador, Sala y Cocina). En restauración se vende en
 * Mostrador/Sala, así que "Caja" (`/tpv`, pantalla de vender) se RETIRA del
 * menú para este sector; "Arqueo" (`/arqueo`, abrir/cerrar turno + cierre Z)
 * se mantiene, solo para owner/manager, igual que en el resto de sectores.
 */
export function buildDashboardNavItems({
  showSettings,
  showManagement = false,
  hasPos,
  sector = "peluqueria",
}: NavGating): NavItem[] {
  const items: NavItem[] = [...PRIMARY_NAV_ITEMS];

  // Gestión y Ajustes se piden por separado: son dos permisos, no uno.
  if (showManagement) {
    items.push(ANALITICA_ITEM);
    if (hasPos) {
      items.push(FACTURACION_ITEM);
    }
    items.push(ARQUEO_ITEM);
  }
  if (showSettings) {
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
    // justo después de Odontograma y Ortodoncia justo después. Planes y Expediente
    // NO viven en el rail: son pestañas dentro de la ficha del paciente
    // (/customers/[id]?tab=planes|expediente), donde el paciente ya está elegido.
    const patientsIdx = withSectorLabels.findIndex((i) => i.href === "/customers");
    const insertAt = patientsIdx === -1 ? withSectorLabels.length : patientsIdx + 1;
    return [
      ...withSectorLabels.slice(0, insertAt),
      ODONTOGRAMA_ITEM,
      PERIODONTOGRAMA_ITEM,
      ORTODONCIA_ITEM,
      ...withSectorLabels.slice(insertAt),
    ];
  }

  if (sector === "restauracion") {
    // Se vende en Mostrador/Sala → "Caja" (/tpv, pantalla de vender) se retira del menú.
    // "Arqueo" (/arqueo) se mantiene: abrir/cerrar turno + cierre Z, donde caen los cobros.
    // "Mostrador", "Sala" y "Cocina" son operativa de venta: SIEMPRE (todos los
    // miembros, staff incluido). "Carta" es gestión (owner/manager): solo si showSettings.
    const base = withSectorLabels.slice(0, 1); // Panel
    const rest = withSectorLabels.slice(1).filter((item) => item.href !== "/tpv");
    // "Carta" es gestión del catálogo (precios), no una preferencia: va con
    // `showManagement`, no con el enlace de Ajustes.
    const extras = showManagement
      ? [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM, CARTA_ITEM]
      : [MOSTRADOR_ITEM, SALA_ITEM, COCINA_ITEM];
    return [...base, ...extras, ...rest];
  }

  return withSectorLabels;
}
