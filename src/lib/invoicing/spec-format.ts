/**
 * Formateadores canónicos de la especificación Veri*factu (AEAT).
 *
 * El `importe` y la `fecha` que se FIRMAN en la huella (`hash.ts`) y los que se
 * imprimen en el documento y se codifican en el QR de cotejo (`verifactu-url.ts`)
 * DEBEN coincidir carácter a carácter: la AEAT recalcula el cotejo a partir de la
 * URL del QR y no cuadraría si el bruto o la fecha se formatearan distinto.
 *
 * Por eso ambos formatos viven aquí, centralizados y compartidos, en lugar de
 * duplicarse. Son parte del contrato: si cambian, cambia la huella.
 *
 *   importe → euros con 2 decimales y punto decimal   ("2100" → "21.00")
 *   fecha   → dd-mm-yyyy en el calendario UTC de expedición
 */

/**
 * Céntimos enteros → euros con 2 decimales y punto decimal ("2100" → "21.00").
 * Usa división entera + resto para no introducir ruido de coma flotante.
 */
export function centsToSpecAmount(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Importe no entero para la especificación Veri*factu: ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return `${sign}${euros}.${remainder.toString().padStart(2, "0")}`;
}

/** `Date` → `dd-mm-yyyy` en UTC (calendario de la fecha de expedición). */
export function formatSpecDate(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  return `${day}-${month}-${year}`;
}
