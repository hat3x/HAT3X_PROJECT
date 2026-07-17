/**
 * Ticket de compra imprimible (HTML autónomo) para impresora TÉRMICA de rollo.
 *
 * ── Qué produce ──────────────────────────────────────────────────────────────
 * A partir de una venta cerrada (normalizada a {@link TicketDocumentData}) genera
 * una página HTML COMPLETA y AUTÓNOMA — estilos en línea, sin JS salvo un botón de
 * impresión opcional, sin recursos externos — dimensionada para un rollo térmico
 * de 58 o 80 mm. El TPV la imprime abriéndola en un iframe oculto y lanzando
 * `window.print()` (ver `@/app/(dashboard)/tpv/print-ticket`).
 *
 * Incluye, según la subtarea:
 *   · líneas del ticket (concepto, cantidad × precio, importe);
 *   · descuento del cupón de bienvenida (si se aplicó), con su subtotal previo;
 *   · totales: base imponible, desglose de IVA por tipo y total;
 *   · medios de pago (uno o varios = pago mixto);
 *   · fidelización —solo si hubo cliente—: puntos ganados, saldo y recompensa;
 *   · aviso de que el ticket NO es una factura (la factura es un flujo aparte).
 *
 * ── Por qué "documento térmico" y no `@media print` sobre la app ──────────────
 * El ticket vive como documento HTML propio (no como un `<div>` de la app ocultado
 * al imprimir) para AISLAR el `@page { size: 58mm/80mm }` del tamaño de página de
 * la aplicación (A4/pantalla) y no depender de un frágil "oculta todo menos el
 * ticket". Es el mismo patrón que la factura Veri*factu (`@/lib/invoicing/document`).
 *
 * Es una función PURA: no lee la BD ni el reloj (la fecha llega como `Date`), de
 * modo que es determinista y testeable.
 */

/** Una línea de detalle del ticket (importe BRUTO por línea, IVA incluido). */
export interface TicketDocumentLine {
  description: string;
  /** Cantidad (admite fracciones: venta por peso). */
  quantity: number;
  /** Precio unitario bruto (PVP, IVA incl.) en céntimos. */
  unitPriceCents: number;
  /** Tipo de IVA en porcentaje. */
  vatRate: number;
  /** Importe bruto de la línea (cantidad × unitario) en céntimos. */
  lineTotalCents: number;
}

/** Una fila del desglose de IVA por tipo (base + cuota agrupadas). */
export interface TicketDocumentVatRow {
  vatRate: number;
  baseCents: number;
  taxCents: number;
}

/** Un medio de pago del ticket (una fila por tender: pago simple o mixto). */
export interface TicketDocumentTender {
  label: string;
  amountCents: number;
}

/** El cupón de bienvenida aplicado al ticket, con su descuento ya calculado. */
export interface TicketDocumentCoupon {
  percentOff: number;
  discountCents: number;
}

/** Recompensa de hito desbloqueada por la visita (si la hubo). */
export interface TicketDocumentReward {
  label: string;
  code: string;
}

/** Bloque de fidelización del ticket. Solo presente si se escaneó a un cliente. */
export interface TicketDocumentLoyalty {
  /** Nombre del cliente, si se conoce. */
  customerName: string | null;
  pointsEarned: number;
  pointsBalance: number;
  reward: TicketDocumentReward | null;
}

/** Datos normalizados de una venta cerrada, listos para imprimir el ticket. */
export interface TicketDocumentData {
  /** Nombre comercial del salón (cabecera). */
  salonName: string;
  /** Referencia legible de la venta (p. ej. el id de `pos_sales`). */
  ticketRef: string;
  /** Fecha-hora del cobro. */
  issuedAt: Date;
  /** Moneda ISO (por defecto EUR aguas arriba). */
  currency: string;
  lines: TicketDocumentLine[];
  /**
   * Bruto del ticket ANTES del cupón (subtotal). Coincide con el total cuando no
   * se aplicó ningún cupón.
   */
  grossTotalCents: number;
  /** Cupón aplicado, o `null` si no hubo. */
  coupon: TicketDocumentCoupon | null;
  /** Base imponible (suma de bases, POST-descuento). */
  taxableBaseCents: number;
  /** Desglose de IVA por tipo (POST-descuento). */
  vatBreakdown: TicketDocumentVatRow[];
  /** Total realmente cobrado. */
  totalCents: number;
  /** Medios de pago empleados. */
  tenders: TicketDocumentTender[];
  /** Fidelización acreditada, o `null` si no hubo cliente. */
  loyalty: TicketDocumentLoyalty | null;
  /** Nota del ticket, o `null`. */
  notes: string | null;
}

/** Anchos de rollo térmico soportados (mm). */
export type TicketRollWidth = 58 | 80;

/** Opciones de render del ticket. */
export interface TicketDocumentOptions {
  /** Ancho del rollo en mm. Por defecto 80. */
  rollWidthMm?: TicketRollWidth;
  /** Zona horaria para la fecha. Por defecto Europe/Madrid. */
  timezone?: string;
  /**
   * Incluir el botón "Imprimir" (oculto al imprimir). Por defecto `true`. El TPV
   * lo desactiva porque lanza la impresión mediante un iframe oculto.
   */
  showPrintButton?: boolean;
  /** Frase de despedida del pie. Por defecto "¡Gracias por tu visita!". */
  footerNote?: string;
}

/** Escapa texto para insertarlo con seguridad en HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Importe en céntimos → moneda local es-ES. */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

/** Cantidad con hasta 3 decimales (venta por peso), sin ceros sobrantes. */
function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(quantity);
}

/** Fecha-hora en la zona indicada, formato es-ES (dd/mm/aaaa hh:mm). */
function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Fija el ancho del rollo a uno de los soportados (defensa ante valores raros). */
function normalizeRollWidth(width: number | undefined): TicketRollWidth {
  return width === 58 ? 58 : 80;
}

/** Las líneas del ticket, cada una con su fila "cant × unit ......... importe". */
function renderLines(lines: TicketDocumentLine[], currency: string): string {
  return lines
    .map(
      (line) => `
        <div class="item">
          <div class="item-name">${escapeHtml(line.description)}</div>
          <div class="row">
            <span class="muted">${formatQuantity(line.quantity)} × ${money(line.unitPriceCents, currency)}</span>
            <span class="amount">${money(line.lineTotalCents, currency)}</span>
          </div>
        </div>`,
    )
    .join("");
}

/** Filas del desglose de IVA por tipo (base + cuota). */
function renderVatRows(rows: TicketDocumentVatRow[], currency: string): string {
  return rows
    .map(
      (row) => `
        <div class="row muted">
          <span>IVA ${row.vatRate}% (base ${money(row.baseCents, currency)})</span>
          <span>${money(row.taxCents, currency)}</span>
        </div>`,
    )
    .join("");
}

/** Filas de los medios de pago. */
function renderTenders(tenders: TicketDocumentTender[], currency: string): string {
  return tenders
    .map(
      (tender) => `
        <div class="row muted">
          <span>${escapeHtml(tender.label)}</span>
          <span>${money(tender.amountCents, currency)}</span>
        </div>`,
    )
    .join("");
}

/** Bloque de fidelización (recuadro), solo si hubo cliente. */
function renderLoyalty(loyalty: TicketDocumentLoyalty): string {
  const pointsWord = (n: number): string => (n === 1 ? "punto" : "puntos");
  const name =
    loyalty.customerName !== null
      ? `<div class="loyalty-name">${escapeHtml(loyalty.customerName)}</div>`
      : "";
  const reward =
    loyalty.reward !== null
      ? `
        <div class="loyalty-reward">
          <div class="strong">¡Recompensa desbloqueada!</div>
          <div>${escapeHtml(loyalty.reward.label)}</div>
          <div class="code">${escapeHtml(loyalty.reward.code)}</div>
        </div>`
      : "";
  return `
    <div class="loyalty">
      <div class="loyalty-head">★ Fidelización</div>
      ${name}
      <div class="row">
        <span>Puntos ganados</span>
        <span class="strong">+${loyalty.pointsEarned}</span>
      </div>
      <div class="row muted">
        <span>Saldo</span>
        <span>${loyalty.pointsBalance} ${pointsWord(loyalty.pointsBalance)}</span>
      </div>
      ${reward}
    </div>`;
}

/**
 * Construye el documento HTML imprimible del ticket de compra.
 *
 * El `currency` de {@link TicketDocumentData} se usa en todos los importes; el
 * resto de textos dinámicos se escapan para evitar inyección de HTML.
 */
export function buildTicketDocumentHtml(
  data: TicketDocumentData,
  options: TicketDocumentOptions = {},
): string {
  const rollWidthMm = normalizeRollWidth(options.rollWidthMm);
  const timezone = options.timezone ?? "Europe/Madrid";
  const showPrintButton = options.showPrintButton ?? true;
  const footerNote = options.footerNote ?? "¡Gracias por tu visita!";
  const currency = data.currency;

  // Tipografía y padding se ajustan al ancho de rollo: 58 mm aprieta un poco más.
  const baseFontPx = rollWidthMm === 58 ? 11 : 12.5;

  const couponBlock =
    data.coupon !== null
      ? `
        <div class="row muted">
          <span>Subtotal</span>
          <span>${money(data.grossTotalCents, currency)}</span>
        </div>
        <div class="row">
          <span>Cupón −${data.coupon.percentOff}%</span>
          <span>−${money(data.coupon.discountCents, currency)}</span>
        </div>`
      : "";

  const notesBlock =
    data.notes !== null && data.notes.trim() !== ""
      ? `
      <hr class="rule" />
      <div class="notes">${escapeHtml(data.notes)}</div>`
      : "";

  const loyaltyBlock =
    data.loyalty !== null
      ? `
      <hr class="rule" />
      ${renderLoyalty(data.loyalty)}`
      : "";

  const printButton = showPrintButton
    ? `<div class="print-bar no-print"><button type="button" class="print-btn" onclick="window.print()">Imprimir ticket</button></div>`
    : "";

  const title = `Ticket ${escapeHtml(data.ticketRef)}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
    color: #000;
    font-size: ${baseFontPx}px;
    line-height: 1.35;
  }
  .receipt {
    width: ${rollWidthMm}mm;
    margin: 16px auto;
    padding: 4mm 3mm 5mm;
    background: #fff;
    color: #000;
    /* Sombra solo para la vista en pantalla; se quita al imprimir. */
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 8px 24px rgb(0 0 0 / 0.08);
  }
  .center { text-align: center; }
  .muted { color: #333; }
  .strong { font-weight: 700; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row > span:last-child { white-space: nowrap; }

  header.head { text-align: center; margin-bottom: 6px; }
  .salon {
    font-size: ${baseFontPx + 3}px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .doc-kind { margin-top: 2px; letter-spacing: 0.18em; text-transform: uppercase; font-size: ${baseFontPx - 2}px; }
  .meta { margin-top: 4px; font-size: ${baseFontPx - 1}px; }

  hr.rule { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  hr.rule.solid { border-top: 1px solid #000; }

  .item + .item { margin-top: 4px; }
  .item-name { font-weight: 700; overflow-wrap: anywhere; }
  .amount { font-weight: 700; white-space: nowrap; }

  .totals .row { padding: 1px 0; }
  .grand { font-size: ${baseFontPx + 4}px; font-weight: 700; margin-top: 4px; }

  .loyalty { border: 1px solid #000; padding: 5px 6px; }
  .loyalty-head { text-align: center; font-weight: 700; letter-spacing: 0.06em; }
  .loyalty-name { text-align: center; margin: 1px 0 4px; }
  .loyalty-reward { margin-top: 5px; padding-top: 4px; border-top: 1px dashed #000; text-align: center; }
  .loyalty-reward .code { font-weight: 700; letter-spacing: 0.08em; margin-top: 1px; }

  .notes { white-space: pre-wrap; overflow-wrap: anywhere; }

  .legal { margin-top: 6px; font-size: ${baseFontPx - 2}px; text-align: center; }
  footer.foot { margin-top: 8px; text-align: center; }
  .foot .thanks { font-weight: 700; }
  .foot .flourish { margin-top: 2px; letter-spacing: 0.35em; }

  .print-bar { text-align: center; margin: 16px auto; }
  .print-btn {
    padding: 10px 18px; cursor: pointer; border: none; border-radius: 6px;
    background: #0f766e; color: #fff; font-size: 14px; font-weight: 600;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  @media print {
    html, body { background: #fff; }
    .receipt { width: auto; margin: 0; padding: 0 1mm; box-shadow: none; }
    .no-print { display: none !important; }
  }
  @page { size: ${rollWidthMm}mm auto; margin: 3mm 0; }
</style>
</head>
<body>
  ${printButton}
  <main class="receipt">
    <header class="head">
      <div class="salon">${escapeHtml(data.salonName)}</div>
      <div class="doc-kind">Ticket de compra</div>
      <div class="meta">${formatDateTime(data.issuedAt, timezone)}</div>
      <div class="meta muted">Nº ${escapeHtml(data.ticketRef)}</div>
    </header>

    <hr class="rule" />

    <section class="items">
      ${renderLines(data.lines, currency)}
    </section>

    <hr class="rule" />

    <section class="totals tabular">
      ${couponBlock}
      <div class="row muted">
        <span>Base imponible</span>
        <span>${money(data.taxableBaseCents, currency)}</span>
      </div>
      ${renderVatRows(data.vatBreakdown, currency)}
      <div class="row grand">
        <span>TOTAL</span>
        <span>${money(data.totalCents, currency)}</span>
      </div>
    </section>

    <hr class="rule" />

    <section class="payments">
      ${renderTenders(data.tenders, currency)}
    </section>
    ${loyaltyBlock}
    ${notesBlock}

    <div class="legal muted">Este documento no es una factura.</div>

    <footer class="foot">
      <div class="thanks">${escapeHtml(footerNote)}</div>
      <div class="flourish muted">* * *</div>
    </footer>
  </main>
</body>
</html>`;
}
