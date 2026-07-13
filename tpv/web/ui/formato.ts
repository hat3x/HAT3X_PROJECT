// ============================================================================
// TPV · UI · Formateo (es-ES)
// ----------------------------------------------------------------------------
// Utilidades puras de presentación. No calculan dinero (eso es de money.ts);
// sólo dan formato humano. Se memorizan los Intl.* porque construirlos en cada
// render de una rejilla de catálogo es caro en tablet.
// ============================================================================

const fmtEUR = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtNum = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 12.5 → "12,50 €". Tolera null/NaN devolviendo el cero formateado. */
export function euros(valor: number | null | undefined): string {
  return fmtEUR.format(Number.isFinite(valor as number) ? (valor as number) : 0);
}

/** Importe sin símbolo (para inputs / desgloses compactos). */
export function numero(valor: number | null | undefined): string {
  return fmtNum.format(Number.isFinite(valor as number) ? (valor as number) : 0);
}

/** "21" → "21 %". Para etiquetas de tramo de IVA. */
export function porcentaje(valor: number): string {
  return `${numero(valor)} %`;
}

/** Hora local corta "18:42" desde un ISO-8601. */
export function hora(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** Nº de ticket con cero a la izquierda: 7 → "#0007". */
export function numeroTicket(n: number): string {
  return `#${String(n).padStart(4, '0')}`;
}
