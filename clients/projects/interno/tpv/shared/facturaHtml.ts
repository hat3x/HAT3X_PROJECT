// ============================================================================
// TPV · Render HTML imprimible / descargable a PDF de una factura (puro)
// ----------------------------------------------------------------------------
// Genera un documento HTML AUTOCONTENIDO (CSS en línea, sin recursos externos)
// a partir del snapshot inmutable de la factura. La "exportación a PDF" se hace
// con la impresión del navegador (Ctrl-P → «Guardar como PDF»): cero dependencias
// de servidor, misma salida en pantalla e impresión y formato A4 fiel.
//
// Puro y determinista: no toca red ni DOM; devuelve una cadena. La web lo abre en
// una ventana/iframe para imprimir (ver `web/facturaPdf.ts`); el servidor podría
// devolverlo como text/html si en el futuro se quisiera render server-side.
//
// Seguridad: TODO texto variable pasa por `escaparHtml` para evitar inyección de
// HTML desde datos fiscales o descripciones de línea.
// ============================================================================

import {
  formatearFecha,
  formatearImporte,
  formatearReferencia,
  formatearTipoIva,
} from './factura.ts';
import type { Factura } from './types.ts';

/** Escapa los cinco caracteres peligrosos para contexto HTML de texto/atributo. */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convierte saltos de línea de un texto (ya escapado) en <br> para el HTML. */
function conSaltos(textoEscapado: string): string {
  return textoEscapado.replace(/\r?\n/g, '<br>');
}

export interface OpcionesRenderFactura {
  /** Título del documento (pestaña / nombre por defecto del PDF). */
  titulo?: string;
  /** Si true, inserta un script que lanza window.print() al cargar. */
  autoImprimir?: boolean;
  /** Locale para importes y fechas (por defecto es-ES). */
  locale?: string;
}

/** Etiqueta legible del estado de la factura. */
function etiquetaEstado(estado: Factura['estado']): string {
  switch (estado) {
    case 'rectificada':
      return 'Rectificada';
    case 'anulada':
      return 'Anulada';
    default:
      return 'Emitida';
  }
}

/**
 * Genera el documento HTML completo de la factura, listo para imprimir o
 * guardar como PDF. Autocontenido (CSS embebido, sin recursos externos).
 */
export function renderFacturaHTML(
  factura: Factura,
  opciones: OpcionesRenderFactura = {},
): string {
  const locale = opciones.locale ?? 'es-ES';
  const moneda = factura.moneda || 'EUR';
  const eur = (v: number) => escaparHtml(formatearImporte(v, moneda, locale));
  const referencia = formatearReferencia(factura.serie, factura.numero);
  const titulo = opciones.titulo ?? `Factura ${referencia}`;

  const emisorNombre = factura.emisor_razon_social?.trim() || 'Emisor sin configurar';
  const clienteNombre =
    factura.razon_social?.trim() || 'Cliente contado (factura simplificada)';

  const filasLineas = (factura.lineas_snapshot ?? [])
    .map((l) => {
      const base = l.total_linea - l.importe_impuesto;
      return `
        <tr>
          <td class="desc">${conSaltos(escaparHtml(l.descripcion))}</td>
          <td class="num">${escaparHtml(l.cantidad)}</td>
          <td class="num">${eur(l.precio_unitario)}</td>
          <td class="num">${l.descuento > 0 ? eur(l.descuento) : '—'}</td>
          <td class="num">${escaparHtml(formatearTipoIva(l.tipo_impuesto, locale))}</td>
          <td class="num">${eur(base)}</td>
          <td class="num total">${eur(l.total_linea)}</td>
        </tr>`;
    })
    .join('');

  const filasDesglose = (factura.desglose_iva ?? [])
    .map(
      (t) => `
        <tr>
          <td>${escaparHtml(formatearTipoIva(t.tipo_impuesto, locale))}</td>
          <td class="num">${eur(t.base)}</td>
          <td class="num">${eur(t.cuota)}</td>
        </tr>`,
    )
    .join('');

  const bloqueCliente = [
    `<strong>${escaparHtml(clienteNombre)}</strong>`,
    factura.nif ? `NIF/CIF: ${escaparHtml(factura.nif)}` : '',
    factura.direccion_fiscal ? conSaltos(escaparHtml(factura.direccion_fiscal)) : '',
    factura.cliente_email ? escaparHtml(factura.cliente_email) : '',
  ]
    .filter(Boolean)
    .join('<br>');

  const bloqueEmisor = [
    `<strong>${escaparHtml(emisorNombre)}</strong>`,
    factura.emisor_nif ? `NIF/CIF: ${escaparHtml(factura.emisor_nif)}` : '',
    factura.emisor_direccion_fiscal
      ? conSaltos(escaparHtml(factura.emisor_direccion_fiscal))
      : '',
  ]
    .filter(Boolean)
    .join('<br>');

  const pie = factura.pie_factura?.trim()
    ? `<footer class="pie">${conSaltos(escaparHtml(factura.pie_factura))}</footer>`
    : '';

  const scriptImprimir = opciones.autoImprimir
    ? '<script>window.addEventListener("load",function(){window.focus();window.print();});</script>'
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<style>
  :root { --tinta:#111; --tenue:#666; --linea:#d8d8d8; --fondo:#fff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f2f2f2; color: var(--tinta);
    font: 14px/1.5 "Helvetica Neue", Arial, sans-serif; }
  .hoja { max-width: 800px; margin: 24px auto; background: var(--fondo);
    padding: 40px 44px; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
  h1 { font-size: 22px; letter-spacing: .04em; margin: 0 0 2px; text-transform: uppercase; }
  .cabecera { display: flex; justify-content: space-between; align-items: flex-start;
    gap: 24px; border-bottom: 2px solid var(--tinta); padding-bottom: 16px; }
  .meta { text-align: right; font-size: 13px; color: var(--tenue); }
  .meta .ref { font-size: 18px; color: var(--tinta); font-weight: 700; letter-spacing: .05em; }
  .badge { display: inline-block; margin-top: 4px; padding: 1px 8px; border: 1px solid var(--linea);
    border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .badge.anulada { color: #b00020; border-color: #b00020; }
  .partes { display: flex; gap: 32px; margin: 24px 0; }
  .parte { flex: 1; }
  .parte h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em;
    color: var(--tenue); margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--tenue); border-bottom: 1px solid var(--tinta); padding: 6px 8px; }
  tbody td { padding: 8px; border-bottom: 1px solid var(--linea); vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  td.total { font-weight: 600; }
  .desc { width: 40%; }
  .resumen { display: flex; justify-content: space-between; gap: 32px; margin-top: 24px; }
  .desglose { flex: 1; }
  .desglose caption { text-align: left; font-size: 11px; text-transform: uppercase;
    letter-spacing: .1em; color: var(--tenue); margin-bottom: 4px; }
  .totales { width: 280px; }
  .totales .fila { display: flex; justify-content: space-between; padding: 4px 0; }
  .totales .fila.gran { border-top: 2px solid var(--tinta); margin-top: 6px; padding-top: 10px;
    font-size: 18px; font-weight: 700; }
  .pie { margin-top: 32px; padding-top: 14px; border-top: 1px solid var(--linea);
    font-size: 12px; color: var(--tenue); white-space: normal; }
  .barra { max-width: 800px; margin: 0 auto 8px; text-align: right; }
  .barra button { font: inherit; padding: 8px 16px; border: 1px solid var(--tinta);
    background: var(--tinta); color: #fff; border-radius: 6px; cursor: pointer; }
  @media print {
    html, body { background: #fff; }
    .hoja { box-shadow: none; margin: 0; max-width: none; padding: 0; }
    .barra { display: none; }
    @page { size: A4; margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="barra"><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <article class="hoja">
    <header class="cabecera">
      <div>
        <h1>Factura</h1>
        <div class="parte" style="margin-top:12px">
          <h2>Emisor</h2>
          <div>${bloqueEmisor}</div>
        </div>
      </div>
      <div class="meta">
        <div class="ref">${escaparHtml(referencia)}</div>
        <div>Fecha: ${escaparHtml(formatearFecha(factura.emitida_at, locale))}</div>
        <div class="badge ${factura.estado === 'anulada' ? 'anulada' : ''}">${escaparHtml(etiquetaEstado(factura.estado))}</div>
      </div>
    </header>

    <section class="partes">
      <div class="parte">
        <h2>Cliente</h2>
        <div>${bloqueCliente}</div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th class="desc">Concepto</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Dto.</th>
          <th class="num">IVA</th>
          <th class="num">Base</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${filasLineas || '<tr><td colspan="7">Sin líneas</td></tr>'}</tbody>
    </table>

    <section class="resumen">
      <table class="desglose">
        <caption>Desglose de IVA</caption>
        <thead>
          <tr><th>Tipo</th><th class="num">Base imponible</th><th class="num">Cuota</th></tr>
        </thead>
        <tbody>${filasDesglose || '<tr><td colspan="3">—</td></tr>'}</tbody>
      </table>
      <div class="totales">
        <div class="fila"><span>Base imponible</span><span>${eur(factura.base_imponible)}</span></div>
        <div class="fila"><span>Total IVA</span><span>${eur(factura.impuestos)}</span></div>
        <div class="fila gran"><span>Total</span><span>${eur(factura.total)}</span></div>
      </div>
    </section>

    ${pie}
  </article>
  ${scriptImprimir}
</body>
</html>`;
}
