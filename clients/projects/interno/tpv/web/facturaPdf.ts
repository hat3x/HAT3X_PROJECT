// ============================================================================
// TPV · Exportación de factura a PDF imprimible/descargable (navegador)
// ----------------------------------------------------------------------------
// Convierte una factura en un documento imprimible reutilizando el render puro
// compartido (`shared/facturaHtml`). "PDF" = diálogo de impresión del navegador
// («Guardar como PDF»): sin dependencias ni servicios externos, salida idéntica
// en pantalla e impresión.
//
// Dos vías:
//   · imprimirFactura(...)  → imprime en un IFRAME oculto (no lo bloquea el popup
//     blocker; se auto-limpia). Recomendado para el botón "Imprimir / PDF".
//   · descargarFacturaHTML(...) → descarga el .html autocontenido (respaldo para
//     archivar/adjuntar). El usuario lo abre e imprime a PDF cuando quiera.
//
// Sólo se ejecutan en navegador; llaman a APIs de `window`/`document`.
// ============================================================================

import { formatearReferencia } from '../shared/factura';
import { renderFacturaHTML, type OpcionesRenderFactura } from '../shared/facturaHtml';
import type { Factura } from '../shared/types';

/** Nombre de archivo seguro para la factura, p.ej. "factura-A-000123". */
export function nombreArchivoFactura(factura: Factura): string {
  const ref = formatearReferencia(factura.serie, factura.numero)
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `factura-${ref}`;
}

/**
 * Imprime la factura mediante un iframe oculto y lanza el diálogo de impresión
 * (donde el usuario elige impresora o «Guardar como PDF»). El iframe se elimina
 * cuando termina la impresión. Devuelve una promesa que resuelve tras disparar
 * la impresión (o al agotar un timeout de seguridad).
 */
export function imprimirFactura(
  factura: Factura,
  opciones: OpcionesRenderFactura = {},
): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('imprimirFactura sólo funciona en el navegador'));
  }

  const html = renderFacturaHTML(factura, { ...opciones, autoImprimir: false });

  return new Promise<void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    let limpiado = false;
    const limpiar = () => {
      if (limpiado) return;
      limpiado = true;
      // Retraso para no cortar el trabajo de impresión en algunos navegadores.
      setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000);
      resolve();
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return limpiar();
      win.addEventListener('afterprint', limpiar);
      win.focus();
      win.print();
      // Respaldo por si 'afterprint' no dispara (algunos navegadores).
      setTimeout(limpiar, 60_000);
    };

    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return limpiar();
    doc.open();
    doc.write(html);
    doc.close();
  });
}

/**
 * Abre la factura en una pestaña nueva ya lista para imprimir (autoImprimir).
 * Útil si se prefiere una vista completa. Puede requerir permitir popups.
 * Devuelve la ventana abierta o null si el navegador la bloqueó.
 */
export function abrirFacturaEnPestana(
  factura: Factura,
  opciones: OpcionesRenderFactura = {},
): Window | null {
  if (typeof window === 'undefined') return null;
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(renderFacturaHTML(factura, { autoImprimir: true, ...opciones }));
  win.document.close();
  return win;
}

/**
 * Descarga el documento HTML autocontenido de la factura (respaldo archivable).
 * El archivo es reproducible offline y se puede imprimir a PDF al abrirlo.
 */
export function descargarFacturaHTML(
  factura: Factura,
  opciones: OpcionesRenderFactura = {},
): void {
  if (typeof document === 'undefined') return;
  const html = renderFacturaHTML(factura, opciones);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivoFactura(factura)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Liberar el objeto URL tras el click (dar margen a la descarga).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
