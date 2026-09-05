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

const fmtFecha = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const fmtFechaHora = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha corta "13 jul 2026" desde un ISO-8601. */
export function fecha(iso: string): string {
  try {
    return fmtFecha.format(new Date(iso));
  } catch {
    return '';
  }
}

/** Fecha + hora "13 jul, 18:42" desde un ISO-8601 (para el histórico de caja). */
export function fechaHora(iso: string): string {
  try {
    return fmtFechaHora.format(new Date(iso));
  } catch {
    return '';
  }
}

/**
 * Importe con signo explícito para descuadres/movimientos: 3.5 → "+3,50 €",
 * −5 → "−5,00 €", 0 → "0,00 €". Usa el menos tipográfico (−), no el guion.
 */
export function eurosConSigno(valor: number | null | undefined): string {
  const n = Number.isFinite(valor as number) ? (valor as number) : 0;
  if (n > 0) return `+${euros(n)}`;
  if (n < 0) return `−${euros(Math.abs(n))}`;
  return euros(0);
}
