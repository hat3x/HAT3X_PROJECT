/**
 * Comanda de cocina imprimible (HTML autónomo) para impresora TÉRMICA de rollo.
 *
 * ── Qué produce ──────────────────────────────────────────────────────────────
 * A partir de un pedido de venta de mostrador (restauración) genera una página
 * HTML COMPLETA y AUTÓNOMA — estilos en línea, sin recursos externos — dimensionada
 * para un rollo térmico de 58 o 80 mm. Es la comanda que va a la estación de
 * preparación (cocina, barra…), NO el ticket de compra: por eso NO lleva precios
 * ni importes, solo lo que hay que preparar.
 *
 * Incluye: número de pedido en tamaño grande (para localizarlo de un vistazo),
 * la estación destino, la etiqueta/mesa (si la hay), fecha-hora de emisión y las
 * líneas `cantidad × nombre` con sus modificadores debajo.
 *
 * ── Por qué "documento térmico" propio (y no reutilizar el ticket) ────────────
 * Mismo patrón que `@/lib/tpv/ticket-document`: un documento HTML propio con su
 * `@page { size: 58mm/80mm }`, aislado del tamaño de página de la app, impreso
 * mediante iframe oculto + `window.print()` (ver `printKitchenComanda`).
 *
 * Es una función PURA: no lee la BD ni el reloj (la fecha llega como `Date`), de
 * modo que es determinista y testeable.
 */

/** Una línea de la comanda: lo que hay que preparar, sin precio. */
export interface KitchenComandaLine {
  /** Cantidad de unidades a preparar. */
  qty: number;
  /** Nombre del producto/plato. */
  name: string;
  /** Modificadores aplicados a la línea (p. ej. "Extra bacon", "Sin cebolla"). */
  modifiers: string[];
}

/** Datos normalizados de un pedido, listos para imprimir su comanda de cocina. */
export interface KitchenComandaData {
  /** Número de pedido (se imprime en tamaño grande). */
  orderNumber: number;
  /** Estación destino de la comanda (p. ej. "Cocina", "Barra"). */
  stationName: string;
  /** Etiqueta o mesa asociada al pedido, o `null` si no aplica. */
  label: string | null;
  /** Fecha-hora de emisión de la comanda. */
  issuedAt: Date;
  /** Líneas a preparar. */
  lines: KitchenComandaLine[];
}

/** Anchos de rollo térmico soportados (mm). */
export type KitchenComandaRollWidth = 58 | 80;

/** Opciones de render de la comanda. */
export interface KitchenComandaOptions {
  /** Ancho del rollo en mm. Por defecto 80. */
  rollWidthMm?: KitchenComandaRollWidth;
  /** Zona horaria para la fecha. Por defecto Europe/Madrid. */
  timezone?: string;
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

/**
 * Hora en la zona indicada, formato 24h `HH:MM` (dos puntos, no coma: el
 * separador decimal es-ES usa coma y la comanda no debe llevar ningún número
 * con pinta de importe).
 */
function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Fecha (sin hora) en la zona indicada, formato dd/mm/aaaa. */
function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Fija el ancho del rollo a uno de los soportados (defensa ante valores raros). */
function normalizeRollWidth(width: number | undefined): KitchenComandaRollWidth {
  return width === 58 ? 58 : 80;
}

/** Los modificadores de una línea, uno por fila, indentados debajo del nombre. */
function renderModifiers(modifiers: string[]): string {
  if (modifiers.length === 0) return "";
  return `
        <div class="modifiers">
          ${modifiers.map((modifier) => `<div class="modifier">— ${escapeHtml(modifier)}</div>`).join("")}
        </div>`;
}

/** Las líneas de la comanda: `cant × nombre` y, debajo, sus modificadores. */
function renderLines(lines: KitchenComandaLine[]): string {
  return lines
    .map(
      (line) => `
        <div class="item">
          <div class="item-name"><span class="qty">${line.qty}×</span> ${escapeHtml(line.name)}</div>
          ${renderModifiers(line.modifiers)}
        </div>`,
    )
    .join("");
}

/**
 * Construye el documento HTML imprimible de la comanda de cocina.
 *
 * SIN precios ni importes: es una comanda de preparación, no un ticket de venta.
 * Todo el texto dinámico se escapa para evitar inyección de HTML.
 */
export function buildKitchenComandaHtml(
  data: KitchenComandaData,
  options: KitchenComandaOptions = {},
): string {
  const rollWidthMm = normalizeRollWidth(options.rollWidthMm);
  const timezone = options.timezone ?? "Europe/Madrid";

  // Tipografía y padding se ajustan al ancho de rollo: 58 mm aprieta un poco más.
  const baseFontPx = rollWidthMm === 58 ? 11 : 12.5;

  const labelBlock =
    data.label !== null && data.label.trim() !== ""
      ? `<div class="label">${escapeHtml(data.label)}</div>`
      : "";

  const title = `Comanda ${data.orderNumber}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
    color: #000;
    font-size: ${baseFontPx}px;
    line-height: 1.35;
  }
  .comanda {
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

  header.head { text-align: center; margin-bottom: 6px; }
  .doc-kind { letter-spacing: 0.18em; text-transform: uppercase; font-size: ${baseFontPx - 1}px; }
  .order-number {
    font-size: ${baseFontPx + 22}px; font-weight: 800; line-height: 1;
    margin: 4px 0;
  }
  .station {
    font-size: ${baseFontPx + 4}px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .label { margin-top: 2px; font-size: ${baseFontPx + 1}px; font-weight: 700; }
  .meta { margin-top: 4px; font-size: ${baseFontPx - 1}px; }

  hr.rule { border: 0; border-top: 1px dashed #000; margin: 6px 0; }

  .item + .item { margin-top: 8px; }
  .item-name { font-weight: 700; overflow-wrap: anywhere; font-size: ${baseFontPx + 1.5}px; }
  .qty { font-weight: 800; }
  .modifiers { margin-top: 2px; padding-left: 10px; }
  .modifier { overflow-wrap: anywhere; }

  footer.foot { margin-top: 10px; text-align: center; }
  .foot .flourish { letter-spacing: 0.35em; }

  @media print {
    html, body { background: #fff; }
    .comanda { width: auto; margin: 0; padding: 0 1mm; box-shadow: none; }
  }
  @page { size: ${rollWidthMm}mm auto; margin: 3mm 0; }
</style>
</head>
<body>
  <main class="comanda">
    <header class="head">
      <div class="doc-kind">Comanda</div>
      <div class="order-number">${data.orderNumber}</div>
      <div class="station">${escapeHtml(data.stationName)}</div>
      ${labelBlock}
      <div class="meta muted">${formatDate(data.issuedAt, timezone)} · ${formatTime(data.issuedAt, timezone)}</div>
    </header>

    <hr class="rule" />

    <section class="items">
      ${renderLines(data.lines)}
    </section>

    <footer class="foot">
      <div class="flourish muted">* * *</div>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * Imprime la comanda: genera el documento HTML térmico y lo lanza a la impresora
 * del sistema mediante un iframe oculto. No-op en servidor (sin `document`).
 *
 * Copia la estructura de `printTicketDocument` (`@/app/(dashboard)/tpv/print-ticket`):
 * el `srcdoc` se fija ANTES de insertar el iframe para que su primer evento `load`
 * sea el de la comanda (no el `about:blank` inicial), y el iframe se retira tras
 * `afterprint` (con un respaldo por timeout para navegadores que no lo emiten).
 */
export function printKitchenComanda(
  data: KitchenComandaData,
  options: KitchenComandaOptions = {},
): void {
  if (typeof document === "undefined") return;

  const html = buildKitchenComandaHtml(data, options);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "Comanda de cocina";
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

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
