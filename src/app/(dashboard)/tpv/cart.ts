import { computeSaleTotals, type SaleTotals } from "@/lib/payments";
import type { PosPaymentMethod, Product, Service } from "@/types/database";

/**
 * Tipos y helpers PUROS del carrito de caja, compartidos por la pantalla de
 * caja (`tpv-view`) y el diálogo de cobro (`payment-dialog`). Sin React, sin
 * red: solo estado local y aritmética (delegada en `@/lib/payments`).
 *
 * Los importes editables viven como TEXTO (en euros) porque son campos de
 * formulario; la conversión a céntimos y el cálculo de totales se hacen aquí de
 * forma tolerante (una línea a medio escribir cuenta como 0, nunca revienta).
 */

/** Una línea del ticket en edición. Importes en euros como texto. */
export interface TicketLine {
  /** id local estable para React (no es el id de BD). */
  localId: string;
  /** Naturaleza de la línea. `manual` = concepto escrito a mano. */
  kind: "service" | "product" | "manual";
  /** id del servicio/producto de origen; `null` en líneas manuales. */
  refId: string | null;
  description: string;
  /** Cantidad como texto (admite "1", "2", "0,5"). */
  quantity: string;
  /** Precio unitario BRUTO en euros como texto ("12,50"). */
  unitPrice: string;
  /** Tipo de IVA en porcentaje como texto ("21"). */
  vatRate: string;
}

/** Un medio de pago en edición dentro del diálogo de cobro. */
export interface TenderDraft {
  /** Tipo base (enum de reconciliación). */
  method: PosPaymentMethod;
  /** Importe en euros como texto. */
  amount: string;
  /** Método concreto del catálogo del salón (opcional). */
  paymentMethodId: string | null;
  /** Referencia externa (autorización, id de operación…). */
  reference?: string;
}

/** IVA por defecto de un servicio (España: tipo general). Los servicios no
 * guardan su tipo de IVA en el catálogo, así que se asume el general. */
export const DEFAULT_SERVICE_VAT_RATE = 21;

/** Euros como texto ("12,50"/"12.50") → céntimos enteros, o `null` si no es
 * un importe válido (campo vacío o a medio escribir). */
export function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed.replace(",", ".")) * 100);
}

/** Cantidad como texto → número > 0, o `null` si no es válida. */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+([.,]\d{1,3})?$/.test(trimmed)) return null;
  const qty = Number.parseFloat(trimmed.replace(",", "."));
  return qty > 0 ? qty : null;
}

/** ¿La línea tiene descripción, cantidad y precio válidos (aporta al total)? */
export function isLineComplete(line: TicketLine): boolean {
  return (
    line.description.trim() !== "" &&
    parseQuantity(line.quantity) !== null &&
    parseEuroToCents(line.unitPrice) !== null
  );
}

/**
 * Totales del ticket, tolerante a líneas incompletas (se ignoran). Reutiliza
 * `computeSaleTotals` de la capa de pagos: misma aritmética que persiste el
 * Server Action y que usa la facturación.
 */
export function computeTicketTotals(lines: readonly TicketLine[]): SaleTotals {
  const inputs = lines.filter(isLineComplete).map((line) => ({
    quantity: parseQuantity(line.quantity)!,
    unitPriceCents: parseEuroToCents(line.unitPrice)!,
    vatRate: Number.parseFloat(line.vatRate.replace(",", ".")) || 0,
  }));
  return computeSaleTotals(inputs);
}

/** Convierte un importe en céntimos a euros con coma (para prellenar campos). */
export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

let counter = 0;
/** id local incremental estable para las líneas (no depende de Math.random). */
function nextLocalId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Crea una línea de ticket a partir de un servicio del catálogo. */
export function lineFromService(service: Service): TicketLine {
  return {
    localId: nextLocalId("svc"),
    kind: "service",
    refId: service.id,
    description: service.name,
    quantity: "1",
    unitPrice: centsToEuroInput(service.price_cents),
    vatRate: String(DEFAULT_SERVICE_VAT_RATE),
  };
}

/** Crea una línea de ticket a partir de un producto del catálogo. */
export function lineFromProduct(product: Product): TicketLine {
  return {
    localId: nextLocalId("prd"),
    kind: "product",
    refId: product.id,
    description: product.name,
    quantity: "1",
    unitPrice: centsToEuroInput(product.price_cents),
    vatRate: String(product.vat_rate),
  };
}

/** Crea una línea manual vacía (concepto escrito a mano). */
export function blankManualLine(): TicketLine {
  return {
    localId: nextLocalId("man"),
    kind: "manual",
    refId: null,
    description: "",
    quantity: "1",
    unitPrice: "",
    vatRate: "21",
  };
}
