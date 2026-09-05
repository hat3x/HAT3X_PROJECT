// ============================================================================
// TPV · Núcleo de facturación (puro, sin dependencias, servidor + cliente)
// ----------------------------------------------------------------------------
// Construye el SNAPSHOT de una factura a partir de las líneas ya persistidas de
// un ticket: mapea las líneas, recalcula el desglose de IVA y los totales con el
// MISMO núcleo monetario que el resto del TPV (`money.ts`) y aporta utilidades
// de formato (referencia "SERIE/NÚMERO", importes y fechas es-ES).
//
// Se importa idéntico desde las Edge Functions (Deno) y desde la web. No accede
// a red ni a BD: la resolución de emisor/serie/config vive en la capa servidor
// (`functions/_shared/factura.ts`); aquí sólo hay cálculo y formato deterministas.
//
// Regla de oro (heredada de money.ts): los importes de la factura se DERIVAN de
// las líneas, nunca se reciben del cliente. Así la base imponible, el IVA y el
// total de la factura son siempre coherentes con las líneas congeladas.
// ============================================================================

import { calcularTotales, redondear2, type LineaCalculada } from './money.ts';
import type {
  DesgloseIvaTramo,
  Factura,
  FacturaCompleta,
  LineaFacturaSnapshot,
  LineaTicket,
} from './types.ts';

// ----------------------------------------------------------------------------
// Mapeo de líneas de ticket → snapshot de factura
// ----------------------------------------------------------------------------

/** Congela una línea de ticket en su forma de factura (subconjunto estable). */
export function lineaTicketASnapshot(l: LineaTicket): LineaFacturaSnapshot {
  return {
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    descuento: l.descuento,
    tipo_impuesto: l.tipo_impuesto,
    importe_impuesto: l.importe_impuesto,
    total_linea: l.total_linea,
  };
}

/**
 * Reconstruye la forma `LineaCalculada` (la que entiende `calcularTotales`) a
 * partir de una línea ya persistida, derivando las bases desde sus campos.
 * base_bruta = cantidad × precio_unitario · base_neta = base_bruta − descuento.
 */
function lineaSnapshotACalculada(l: LineaFacturaSnapshot): LineaCalculada {
  const baseBruta = redondear2(l.cantidad * l.precio_unitario);
  const baseNeta = redondear2(baseBruta - l.descuento);
  return {
    base_bruta: baseBruta,
    descuento: l.descuento,
    base_neta: baseNeta,
    tipo_impuesto: l.tipo_impuesto,
    importe_impuesto: l.importe_impuesto,
    total_linea: l.total_linea,
  };
}

/** Totales + desglose de IVA de una factura, derivados de sus líneas snapshot. */
export interface ResumenFactura {
  base_imponible: number;
  impuestos: number;
  total: number;
  desglose_iva: DesgloseIvaTramo[];
}

/**
 * Calcula base imponible, IVA total, total y desglose por tipo a partir de las
 * líneas facturadas. Reutiliza `calcularTotales` (money.ts) → mismo redondeo y
 * misma agregación que la cabecera del ticket.
 */
export function resumenDeLineas(lineas: LineaFacturaSnapshot[]): ResumenFactura {
  const totales = calcularTotales(lineas.map(lineaSnapshotACalculada));
  return {
    base_imponible: totales.subtotal,
    impuestos: totales.impuestos_total,
    total: totales.total,
    desglose_iva: totales.desglose_iva,
  };
}

/** Snapshot completo (líneas + resumen) listo para persistir en la factura. */
export function construirSnapshotFactura(lineasTicket: LineaTicket[]): {
  lineas_snapshot: LineaFacturaSnapshot[];
  resumen: ResumenFactura;
} {
  const lineas_snapshot = lineasTicket.map(lineaTicketASnapshot);
  return { lineas_snapshot, resumen: resumenDeLineas(lineas_snapshot) };
}

// ----------------------------------------------------------------------------
// Formato de presentación (referencia, importes, fechas)
// ----------------------------------------------------------------------------

/** Ancho de relleno por defecto del número de factura (000123). */
export const ANCHO_NUMERO_FACTURA = 6;

/**
 * Referencia legible de la factura: "SERIE/NÚMERO" con relleno de ceros,
 * p.ej. formatearReferencia('A', 123) → "A/000123".
 */
export function formatearReferencia(
  serie: string,
  numero: number,
  ancho = ANCHO_NUMERO_FACTURA,
): string {
  return `${serie}/${String(Math.trunc(numero)).padStart(ancho, '0')}`;
}

/** Importe en formato monetario es-ES (fallback robusto si falta Intl/ICU). */
export function formatearImporte(
  valor: number,
  moneda = 'EUR',
  locale = 'es-ES',
): string {
  const v = redondear2(valor);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: moneda,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${moneda}`;
  }
}

/** Porcentaje de IVA legible: 21 → "21%", 10.5 → "10,5%". */
export function formatearTipoIva(tipo: number, locale = 'es-ES'): string {
  try {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(tipo)}%`;
  } catch {
    return `${tipo}%`;
  }
}

/** Fecha ISO → fecha legible es-ES (dd/mm/aaaa). Vacío si la fecha no es válida. */
export function formatearFecha(
  iso: string | null | undefined,
  locale = 'es-ES',
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ----------------------------------------------------------------------------
// Envoltura de respuesta
// ----------------------------------------------------------------------------

/** Envuelve una fila de factura en su respuesta con referencia formateada. */
export function montarFacturaCompleta(factura: Factura): FacturaCompleta {
  return {
    factura,
    referencia: formatearReferencia(factura.serie, factura.numero),
  };
}
