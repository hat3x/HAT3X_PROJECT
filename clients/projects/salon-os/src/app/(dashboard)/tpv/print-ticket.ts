/**
 * Impresión del ticket de compra en la impresora térmica del sistema.
 *
 * Dos piezas, separadas para poder testear la parte pura sin DOM:
 *   · {@link buildTicketData} — mapeo PURO del estado del carrito (líneas, totales,
 *     cobros y fidelización) a {@link TicketDocumentData}. Sin DOM, determinista.
 *   · {@link printTicketDocument} — abre el documento HTML del ticket en un iframe
 *     OCULTO y lanza `window.print()`, que dispara el diálogo de impresión del
 *     sistema hacia la impresora térmica. El iframe se retira al terminar.
 *
 * ── Por qué un iframe oculto (y no `window.print()` de la página) ─────────────
 * El ticket es un documento propio con su `@page { size: 58mm/80mm }`. Imprimirlo
 * en un iframe lo AÍSLA del tamaño de página de la app (A4/pantalla) y evita el
 * frágil "oculta toda la app menos el ticket al imprimir". Además no abre pestañas
 * ni ventanas nuevas (mejor en tablet, sin bloqueos de pop-ups).
 *
 * Vía futura (no implementada aquí): impresión directa ESC/POS por WebUSB, sin el
 * diálogo del sistema. Documentada en `src/lib/tpv/README.md`.
 */
import {
  parseEuroToCents,
  parseQuantity,
  type TicketLine,
  type TicketTotals,
} from "@/app/(dashboard)/tpv/cart";
import {
  buildTicketDocumentHtml,
  type TicketDocumentData,
  type TicketDocumentLoyalty,
  type TicketDocumentOptions,
  type TicketDocumentTender,
} from "@/lib/tpv/ticket-document";
import type { PosPaymentMethod } from "@/types/database";

/** Etiqueta humana de cada método de pago base (fallback si no hay catálogo). */
export const PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  transferencia: "Transferencia",
  otro: "Otro",
};

/** Argumentos de {@link buildTicketData}: la "foto" de la venta recién cerrada. */
export interface BuildTicketDataArgs {
  salonName: string;
  /** Referencia legible de la venta (id de `pos_sales`). */
  ticketRef: string;
  /** Fecha-hora del cobro (se pasa para mantener la función pura). */
  issuedAt: Date;
  /** Líneas COMPLETAS del ticket (las que aportan al total). */
  lines: readonly TicketLine[];
  /** Totales del ticket ya calculados (con el cupón, si lo hubo). */
  totals: TicketTotals;
  /** Medios de pago con etiqueta e importe ya resueltos. */
  tenders: readonly TicketDocumentTender[];
  /** Fidelización acreditada, o `null` si no hubo cliente. */
  loyalty: TicketDocumentLoyalty | null;
  /** Nota del ticket, o `null`. */
  notes: string | null;
}

/**
 * Normaliza una línea del carrito (importes en texto) a una línea de ticket
 * (céntimos). Las líneas ya vienen COMPLETAS, así que los parseos son válidos;
 * aun así se saturan a 0 por defensa (nunca revienta al imprimir).
 */
function toDocumentLine(line: TicketLine): TicketDocumentData["lines"][number] {
  const quantity = parseQuantity(line.quantity) ?? 0;
  const unitPriceCents = parseEuroToCents(line.unitPrice) ?? 0;
  return {
    description: line.description,
    quantity,
    unitPriceCents,
    vatRate: Number.parseFloat(line.vatRate.replace(",", ".")) || 0,
    // Bruto por línea (cantidad × unitario). El descuento del cupón se muestra
    // como una fila aparte, no prorrateado sobre cada línea (igual que en la UI).
    lineTotalCents: Math.round(unitPriceCents * quantity),
  };
}

/**
 * Ensambla los datos imprimibles del ticket a partir del estado del carrito.
 * Función PURA: no toca el DOM ni el reloj.
 */
export function buildTicketData(args: BuildTicketDataArgs): TicketDocumentData {
  const { totals } = args;
  const coupon =
    totals.couponDiscountCents > 0 && totals.couponPercentOff !== null
      ? { percentOff: totals.couponPercentOff, discountCents: totals.couponDiscountCents }
      : null;

  return {
    salonName: args.salonName,
    ticketRef: args.ticketRef,
    issuedAt: args.issuedAt,
    currency: "EUR",
    lines: args.lines.map(toDocumentLine),
    grossTotalCents: totals.grossTotalCents,
    coupon,
    taxableBaseCents: totals.subtotalCents,
    vatBreakdown: totals.vatBreakdown.map((entry) => ({
      vatRate: entry.vatRate,
      baseCents: entry.baseCents,
      taxCents: entry.taxCents,
    })),
    totalCents: totals.totalCents,
    tenders: [...args.tenders],
    loyalty: args.loyalty,
    notes: args.notes,
  };
}

/**
 * Imprime el ticket: genera el documento HTML térmico y lo lanza a la impresora
 * del sistema mediante un iframe oculto. No-op en servidor (sin `document`).
 */
export function printTicketDocument(
  data: TicketDocumentData,
  options: TicketDocumentOptions = {},
): void {
  if (typeof document === "undefined") return;

  const html = buildTicketDocumentHtml(data, { ...options, showPrintButton: false });

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Ticket de compra";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    // Aplaza la retirada para no cancelar el diálogo de impresión aún abierto.
    window.setTimeout(() => iframe.remove(), 0);
  };

  iframe.onload = (): void => {
    const frameWindow = iframe.contentWindow;
    if (frameWindow === null) {
      cleanup();
      return;
    }
    frameWindow.onafterprint = cleanup;
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      cleanup();
      return;
    }
    // Respaldo: algunos navegadores no emiten `afterprint`.
    window.setTimeout(cleanup, 60_000);
  };

  // El `srcdoc` se fija ANTES de insertar el iframe: así su primer (y único) evento
  // `load` es el del ticket, no el `about:blank` inicial (que imprimiría en blanco).
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
