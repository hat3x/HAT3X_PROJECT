/**
 * FILTROS del libro de facturas — parseo + validación PUROS (sub-6).
 *
 * Fuente única de verdad de los filtros de `/facturacion/facturas`: rango de
 * fechas, sede, tipo (F1/F2), método de pago y búsqueda por número/cliente. El
 * estado vive en la URL (enlace compartible/marcable), así que este módulo traduce
 * «lo que pidió el usuario» (searchParams) a un objeto `InvoiceFilters` canónico y
 * robusto, que luego consume la query de servidor.
 *
 * ── Por qué vive aquí (y es PURO) ────────────────────────────────────────────
 * Es lógica sin Supabase ni React, así que la importan por igual el Server
 * Component de la página (para resolver los filtros antes de consultar) y la barra
 * de filtros CLIENTE (para pintar los controles y navegar). Reutiliza el validador
 * de fecha ISO de la analítica (`@/lib/metrics/range`), que ya es apto para cliente.
 *
 * ── Robustez (nunca lanza) ───────────────────────────────────────────────────
 * Todo parámetro inválido se ignora y cae a «sin filtro» (null): una URL manipulada
 * no rompe la página, solo filtra de menos. La sede se valida contra las sedes
 * REALES del salón (defensa en profundidad; además la RLS acota por salón).
 */
import {
  INVOICE_TYPE_CODE,
  PAYMENT_METHOD_LABEL,
} from "@/lib/facturacion/rows";
// Solo el TIPO (erasado en compilación): filters.ts es apto para cliente y no debe
// arrastrar el serializador de exportación al bundle.
import type { ExportFormat } from "@/lib/invoicing/export";
import { isIsoDate } from "@/lib/metrics/range";
import type { PosInvoiceType, PosPaymentMethod } from "@/types/database";

/** Nombres de los parámetros de URL que gobiernan los filtros. */
export const FROM_PARAM = "desde";
export const TO_PARAM = "hasta";
export const LOCATION_PARAM = "sede";
export const TYPE_PARAM = "tipo";
export const METHOD_PARAM = "metodo";
export const SEARCH_PARAM = "q";

/** `searchParams` tal cual los entrega Next (valor único, lista o ausente). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Filtros ya resueltos y validados. `null` en un campo = ese filtro no se aplica.
 * `from`/`to` son fechas locales `YYYY-MM-DD` (independientes: solo `from` = «desde»,
 * solo `to` = «hasta»); `to` es INCLUSIVO (día completo), lo resuelve la RPC.
 */
export interface InvoiceFilters {
  from: string | null;
  to: string | null;
  locationId: string | null;
  invoiceType: PosInvoiceType | null;
  paymentMethod: PosPaymentMethod | null;
  search: string | null;
}

/** Filtros vacíos (ningún criterio aplicado). */
export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  from: null,
  to: null,
  locationId: null,
  invoiceType: null,
  paymentMethod: null,
  search: null,
};

/** Opción presentable de un `<Select>` de filtro (valor de URL + etiqueta). */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Valor de URL del filtro de TIPO ↔ enum `pos_invoice_type`. Se usa el código AEAT
 * en minúsculas (`f1`/`f2`) en la URL por legibilidad; el mapa al enum es la inversa
 * de `INVOICE_TYPE_CODE` (completa→F1, ticket→F2), sin duplicar la relación.
 */
const URL_TO_INVOICE_TYPE: Record<string, PosInvoiceType> = {
  f1: "completa",
  f2: "ticket",
};

/** Enum `pos_invoice_type` → valor de URL (`completa`→`f1`, `ticket`→`f2`). */
export function invoiceTypeToParam(type: PosInvoiceType): string {
  return INVOICE_TYPE_CODE[type].toLowerCase();
}

/** Opciones del filtro de TIPO de factura (F1 / F2). */
export const INVOICE_TYPE_FILTER_OPTIONS: readonly FilterOption[] = [
  { value: "f1", label: "F1 · Factura" },
  { value: "f2", label: "F2 · Simplificada" },
];

/** Orden canónico de los métodos de pago (espejo del enum `pos_payment_method`). */
const PAYMENT_METHOD_VALUES: readonly PosPaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "bizum",
  "transferencia",
  "otro",
];

/** Opciones del filtro de MÉTODO de pago (valor de enum + etiqueta legible). */
export const PAYMENT_METHOD_FILTER_OPTIONS: readonly FilterOption[] =
  PAYMENT_METHOD_VALUES.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABEL[method],
  }));

/** Primer valor de un parámetro que Next puede dar como string | string[]. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Fecha `YYYY-MM-DD` válida de calendario, o `null`. */
function parseDate(raw: string | undefined): string | null {
  return isIsoDate(raw) ? raw : null;
}

/**
 * Resuelve los filtros desde los `searchParams` de la URL. `validLocationIds` son
 * las sedes reales del salón: un `sede` que no esté en esa lista se descarta.
 *
 * Reglas defensivas:
 *   · `desde`/`hasta` no ISO → se ignoran; si AMBOS son válidos pero `desde > hasta`
 *     (rango imposible), se ignora el rango entero (no se filtra por fecha) en vez de
 *     devolver siempre vacío.
 *   · `tipo` distinto de f1/f2, `metodo` fuera del enum, `sede` desconocida → null.
 *   · `q` se recorta; en blanco → null.
 */
export function parseInvoiceFilters(
  searchParams: RawSearchParams,
  validLocationIds: readonly string[] = [],
): InvoiceFilters {
  let from = parseDate(firstParam(searchParams[FROM_PARAM]));
  let to = parseDate(firstParam(searchParams[TO_PARAM]));
  if (from !== null && to !== null && from > to) {
    // Rango imposible: se descarta por completo (defensivo, nunca vacía «a ciegas»).
    from = null;
    to = null;
  }

  const rawLocation = firstParam(searchParams[LOCATION_PARAM]);
  const locationId =
    rawLocation !== undefined && validLocationIds.includes(rawLocation)
      ? rawLocation
      : null;

  const rawType = firstParam(searchParams[TYPE_PARAM])?.toLowerCase();
  const invoiceType =
    rawType !== undefined ? (URL_TO_INVOICE_TYPE[rawType] ?? null) : null;

  const rawMethod = firstParam(searchParams[METHOD_PARAM]);
  const paymentMethod =
    rawMethod !== undefined &&
    (PAYMENT_METHOD_VALUES as readonly string[]).includes(rawMethod)
      ? (rawMethod as PosPaymentMethod)
      : null;

  const rawSearch = firstParam(searchParams[SEARCH_PARAM])?.trim();
  const search = rawSearch !== undefined && rawSearch !== "" ? rawSearch : null;

  return { from, to, locationId, invoiceType, paymentMethod, search };
}

/** ¿Hay algún filtro activo? (para mostrar «Limpiar» y el estado vacío correcto). */
export function hasActiveInvoiceFilters(filters: InvoiceFilters): boolean {
  return (
    filters.from !== null ||
    filters.to !== null ||
    filters.locationId !== null ||
    filters.invoiceType !== null ||
    filters.paymentMethod !== null ||
    filters.search !== null
  );
}

/**
 * Serializa los filtros a pares de query (solo los activos), para que la barra de
 * filtros construya la URL de navegación sin arrastrar parámetros vacíos.
 */
export function invoiceFiltersToSearchParams(
  filters: InvoiceFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from !== null) params.set(FROM_PARAM, filters.from);
  if (filters.to !== null) params.set(TO_PARAM, filters.to);
  if (filters.locationId !== null) params.set(LOCATION_PARAM, filters.locationId);
  if (filters.invoiceType !== null) {
    params.set(TYPE_PARAM, invoiceTypeToParam(filters.invoiceType));
  }
  if (filters.paymentMethod !== null) params.set(METHOD_PARAM, filters.paymentMethod);
  if (filters.search !== null) params.set(SEARCH_PARAM, filters.search);
  return params;
}

// ── Exportación fiscal (libro registro AEAT / gestoría) ─────────────────────────
//
// La descarga reutiliza `GET /api/facturacion/export`, que SOLO acota por periodo
// (y opcionalmente serie). Es deliberado: el libro registro que se entrega a la
// gestoría debe ser COMPLETO para el periodo — no puede omitir facturas porque la
// vista esté filtrada por sede, tipo, método o búsqueda. Esos filtros ordenan y
// acotan la TABLA en pantalla, no el documento fiscal. La UI lo deja claro.

/** Ruta del Route Handler que sirve el libro registro descargable. */
export const INVOICE_EXPORT_PATH = "/api/facturacion/export";

/**
 * Nombres de los parámetros de la EXPORTACIÓN. Ojo: difieren de los de la tabla —
 * el Route Handler lee `from`/`to`/`format` (no `desde`/`hasta`). Se nombran aquí
 * para que el mapeo periodo-de-la-vista → periodo-de-la-descarga sea explícito.
 */
const EXPORT_FROM_PARAM = "from";
const EXPORT_TO_PARAM = "to";
const EXPORT_FORMAT_PARAM = "format";

/**
 * ¿Hay filtros activos que NO acotan la exportación fiscal? (sede, tipo, método o
 * búsqueda). Sirve para avisar en la UI de que la descarga cubrirá TODO el periodo,
 * no solo lo que se ve filtrado en la tabla. El rango de fechas se excluye porque sí
 * viaja a la exportación.
 */
export function hasNonPeriodInvoiceFilters(filters: InvoiceFilters): boolean {
  return (
    filters.locationId !== null ||
    filters.invoiceType !== null ||
    filters.paymentMethod !== null ||
    filters.search !== null
  );
}

/**
 * URL de descarga del libro registro para el periodo dado, reutilizando el Route
 * Handler de exportación. Solo viajan el PERIODO (`from`/`to`, si están) y el
 * `format`; se omiten los parámetros vacíos para no ensuciar la URL. Sin `from`/`to`
 * la descarga es el libro completo (todo el histórico) en ese formato.
 */
export function invoiceExportHref(
  from: string | null,
  to: string | null,
  format: ExportFormat,
): string {
  const params = new URLSearchParams();
  if (from !== null) params.set(EXPORT_FROM_PARAM, from);
  if (to !== null) params.set(EXPORT_TO_PARAM, to);
  params.set(EXPORT_FORMAT_PARAM, format);
  return `${INVOICE_EXPORT_PATH}?${params.toString()}`;
}
