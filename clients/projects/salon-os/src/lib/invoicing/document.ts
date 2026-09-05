/**
 * Documento imprimible (HTML autónomo) de una factura.
 *
 * ── Qué produce ──────────────────────────────────────────────────────────────
 * A partir de un registro de `pos_invoices` (normalizado a {@link InvoiceDocumentData})
 * genera una página HTML COMPLETA y AUTÓNOMA — estilos en línea, sin JS salvo un
 * botón de impresión, sin recursos externos — lista para imprimir o guardar como
 * PDF desde el navegador (Ctrl+P → "Guardar como PDF").
 *
 * Sirve para los dos tipos:
 *   · `ticket`   → FACTURA SIMPLIFICADA: sin datos del receptor.
 *   · `completa` → FACTURA: con NIF/nombre/dirección del receptor.
 *
 * Incluye: emisor, receptor (si aplica), líneas de detalle (si están), desglose
 * de IVA por tipo y totales.
 *
 * Es una función PURA: no lee la BD ni el reloj (las fechas llegan como `Date`).
 */

/** Snapshot del emisor tal como se imprime. */
export interface DocumentIssuer {
  taxId: string;
  legalName: string;
  fiscalAddress: string | null;
}

/** Snapshot del receptor (solo factura completa). */
export interface DocumentRecipient {
  taxId: string;
  name: string;
  address: string | null;
}

/** Una fila del desglose de IVA (misma forma que la columna `tax_breakdown`). */
export interface DocumentTaxRow {
  vat_rate: number;
  base_cents: number;
  cuota_cents: number;
  total_cents: number;
}

/** Línea de detalle opcional (si se dispone de las líneas de la venta). */
export interface DocumentLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents: number;
}

/** Datos normalizados de un registro de factura para imprimir. */
export interface InvoiceDocumentData {
  invoiceType: "ticket" | "completa";
  series: string;
  sequentialNumber: number;
  fullNumber: string;
  /** Fecha de expedición. */
  issuedAt: Date;
  currency: string;
  issuer: DocumentIssuer;
  /** Receptor; `null` en ticket simplificado. */
  recipient: DocumentRecipient | null;
  taxBreakdown: DocumentTaxRow[];
  taxableBaseCents: number;
  taxCents: number;
  totalCents: number;
  /** Líneas de detalle, si están disponibles (venta de origen). Opcional. */
  lines?: DocumentLineItem[];
}

/** Opciones de render. */
export interface InvoiceDocumentOptions {
  /** Zona horaria para mostrar fechas. Por defecto, Europe/Madrid. */
  timezone?: string;
  /** Incluir el botón "Imprimir" (oculto al imprimir). Por defecto, `true`. */
  showPrintButton?: boolean;
}

const TYPE_LABEL: Record<InvoiceDocumentData["invoiceType"], string> = {
  ticket: "Factura simplificada",
  completa: "Factura",
};

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

/** Fecha (solo día) en la zona indicada, formato es-ES (dd/mm/aaaa). */
function formatDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Cantidad con hasta 3 decimales (venta por peso), sin ceros sobrantes. */
function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(quantity);
}

/** Bloque de detalle de líneas (si se dispone). */
function renderLineItems(lines: DocumentLineItem[], currency: string): string {
  const rows = lines
    .map(
      (line) => `
        <tr>
          <td class="desc">${escapeHtml(line.description)}</td>
          <td class="num">${formatQuantity(line.quantity)}</td>
          <td class="num">${money(line.unitPriceCents, currency)}</td>
          <td class="num">${line.vatRate}%</td>
          <td class="num strong">${money(line.lineTotalCents, currency)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table class="lines" aria-label="Detalle de líneas">
      <thead>
        <tr>
          <th class="desc">Concepto</th>
          <th class="num">Cant.</th>
          <th class="num">P. unit.</th>
          <th class="num">IVA</th>
          <th class="num">Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Tabla de desglose de IVA por tipo. */
function renderTaxBreakdown(rows: DocumentTaxRow[], currency: string): string {
  const body = rows
    .map(
      (row) => `
        <tr>
          <td class="num">${row.vat_rate}%</td>
          <td class="num">${money(row.base_cents, currency)}</td>
          <td class="num">${money(row.cuota_cents, currency)}</td>
          <td class="num strong">${money(row.total_cents, currency)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table class="tax" aria-label="Desglose de IVA">
      <thead>
        <tr>
          <th class="num">Tipo IVA</th>
          <th class="num">Base imponible</th>
          <th class="num">Cuota</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

/**
 * Construye el documento HTML imprimible completo de una factura.
 */
/** `true` si TODO el documento es una operación exenta de IVA. */
function isVatExempt(data: InvoiceDocumentData): boolean {
  // Una factura a cero no es una operación exenta: es que no hay operación.
  if (data.totalCents <= 0 || data.taxBreakdown.length === 0) return false;
  // Basta una línea con tipo o cuota para que la factura NO sea exenta: en una
  // factura mixta la mención sería falsa para la mitad del documento.
  return data.taxCents === 0 && data.taxBreakdown.every((r) => r.vat_rate === 0 && r.cuota_cents === 0);
}

/**
 * Mención legal de la exención.
 *
 * El Reglamento de Facturación (RD 1619/2012, art. 6.1.j) obliga a hacer
 * constar el precepto por el que la operación está exenta. Sin esa mención, una
 * factura con cuota cero está formalmente incompleta.
 *
 * Se cita el 20.Uno.3º LIVA —asistencia sanitaria— porque es el supuesto por el
 * que una clínica emite sin IVA. Un tratamiento puramente estético NO está
 * exento y va al 21 %: por eso la casilla de la caja es una decisión por venta
 * y no un ajuste permanente del salón.
 */
function renderExemptionNotice(data: InvoiceDocumentData): string {
  if (!isVatExempt(data)) return "";
  return `<p class="exemption">Operación exenta de IVA en virtud del artículo 20.Uno.3.º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.</p>`;
}

export function buildInvoiceDocumentHtml(
  data: InvoiceDocumentData,
  options: InvoiceDocumentOptions = {},
): string {
  const timezone = options.timezone ?? "Europe/Madrid";
  const showPrintButton = options.showPrintButton ?? true;

  const typeLabel = TYPE_LABEL[data.invoiceType];
  const title = `${typeLabel} ${escapeHtml(data.fullNumber)}`;

  const recipientBlock =
    data.recipient !== null
      ? `
        <section class="party">
          <h2>Receptor</h2>
          <p class="name">${escapeHtml(data.recipient.name)}</p>
          <p>NIF: ${escapeHtml(data.recipient.taxId)}</p>
          ${data.recipient.address !== null ? `<p>${escapeHtml(data.recipient.address)}</p>` : ""}
        </section>`
      : `
        <section class="party party--anon">
          <h2>Receptor</h2>
          <p class="muted">Factura simplificada — sin datos del destinatario.</p>
        </section>`;

  const linesBlock =
    data.lines !== undefined && data.lines.length > 0
      ? renderLineItems(data.lines, data.currency)
      : "";

  const printButton = showPrintButton
    ? `<button type="button" class="print-btn no-print" onclick="window.print()">Imprimir o guardar PDF</button>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #0f766e;
    --paper: #ffffff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    background: #f1f5f9;
    font-size: 13px;
    line-height: 1.5;
  }
  .sheet {
    max-width: 800px;
    margin: 24px auto;
    background: var(--paper);
    padding: 32px 40px 40px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.1), 0 8px 24px rgb(0 0 0 / 0.06);
    border-radius: 8px;
  }
  .tabular { font-variant-numeric: tabular-nums; }

  /* Cabecera */
  header.doc-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    padding-bottom: 20px;
    border-bottom: 2px solid var(--ink);
  }
  .issuer .legal-name { font-size: 18px; font-weight: 700; margin: 0 0 2px; }
  .exemption { margin: 14px 0 0; padding: 8px 10px; border-left: 3px solid #666; font-size: 11px; line-height: 1.45; }
  .issuer p { margin: 0; color: var(--muted); }
  .doc-meta { text-align: right; min-width: 200px; }
  .doc-meta .doc-type {
    display: inline-block;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }
  .doc-meta .doc-number { font-size: 20px; font-weight: 700; margin: 2px 0 8px; }
  .doc-meta dl { margin: 0; display: grid; grid-template-columns: auto auto; gap: 2px 12px; justify-content: end; }
  .doc-meta dt { color: var(--muted); }
  .doc-meta dd { margin: 0; font-weight: 600; }

  /* Partes */
  .parties { display: flex; gap: 24px; margin: 24px 0; }
  .party { flex: 1; }
  .party h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--muted); margin: 0 0 6px; font-weight: 700;
  }
  .party p { margin: 0; }
  .party .name { font-weight: 600; }
  .muted { color: var(--muted); }

  /* Tablas */
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); border-bottom: 1px solid var(--ink); }
  td { border-bottom: 1px solid var(--line); }
  td.num, th.num { text-align: right; }
  td.strong { font-weight: 700; }
  table.tax { max-width: 420px; margin-left: auto; }

  /* Totales */
  .totals { margin-left: auto; max-width: 320px; margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; color: var(--muted); }
  .totals .row.grand {
    border-top: 2px solid var(--ink); margin-top: 6px; padding-top: 10px;
    font-size: 18px; font-weight: 700; color: var(--ink);
  }

  /* Botón imprimir */
  .print-btn {
    display: inline-flex; align-items: center; gap: 8px;
    margin: 0 auto 16px; padding: 10px 18px; cursor: pointer;
    background: var(--accent); color: #fff; border: none; border-radius: 6px;
    font-size: 14px; font-weight: 600;
  }
  .print-bar { text-align: center; }

  @media print {
    body { background: #fff; font-size: 11pt; }
    .sheet { box-shadow: none; margin: 0; max-width: none; border-radius: 0; padding: 0; }
    .no-print { display: none !important; }
  }
  @page { size: A4; margin: 14mm; }
</style>
</head>
<body>
  <div class="print-bar no-print">${printButton}</div>
  <main class="sheet">

    <header class="doc-head">
      <div class="issuer">
        <p class="legal-name">${escapeHtml(data.issuer.legalName)}</p>
        <p>NIF: ${escapeHtml(data.issuer.taxId)}</p>
        ${data.issuer.fiscalAddress !== null ? `<p>${escapeHtml(data.issuer.fiscalAddress)}</p>` : ""}
      </div>
      <div class="doc-meta">
        <span class="doc-type">${escapeHtml(typeLabel)}</span>
        <p class="doc-number">${escapeHtml(data.fullNumber)}</p>
        <dl>
          <dt>Serie</dt><dd>${escapeHtml(data.series)}</dd>
          <dt>Nº</dt><dd>${data.sequentialNumber}</dd>
          <dt>Fecha</dt><dd>${formatDay(data.issuedAt, timezone)}</dd>
        </dl>
      </div>
    </header>

    <div class="parties">
      <section class="party">
        <h2>Emisor</h2>
        <p class="name">${escapeHtml(data.issuer.legalName)}</p>
        <p>NIF: ${escapeHtml(data.issuer.taxId)}</p>
        ${data.issuer.fiscalAddress !== null ? `<p>${escapeHtml(data.issuer.fiscalAddress)}</p>` : ""}
      </section>
      ${recipientBlock}
    </div>

    ${linesBlock}

    ${renderTaxBreakdown(data.taxBreakdown, data.currency)}

    <div class="totals tabular">
      <div class="row"><span>Base imponible</span><span>${money(data.taxableBaseCents, data.currency)}</span></div>
      <div class="row"><span>Total IVA</span><span>${money(data.taxCents, data.currency)}</span></div>
      <div class="row grand"><span>Total</span><span>${money(data.totalCents, data.currency)}</span></div>
    </div>

    ${renderExemptionNotice(data)}

  </main>
</body>
</html>`;
}
