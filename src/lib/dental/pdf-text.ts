import type { PDFFont } from "pdf-lib";

/**
 * Ayudantes de texto para los PDF clínicos (consentimiento, receta).
 *
 * Viven aparte porque los dos documentos los necesitan igual, y tener dos
 * copias del ajuste de línea significaría que un día uno parte los párrafos de
 * una forma y el otro de otra, sobre el mismo texto.
 */

/**
 * Parte un texto en líneas que caben en el ancho dado.
 *
 * Se respetan los saltos de línea del original: un consentimiento suele venir
 * con puntos numerados, y unirlos en un párrafo corrido lo haría ilegible justo
 * donde el paciente tiene que poder seguirlo.
 */
export function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current !== "") lines.push(current);
        current = word;
      }
    }
    if (current !== "") lines.push(current);
  }

  return lines;
}

/** `WinAnsi` de las fuentes estándar no cubre todo; se sustituye lo que falta. */
export function toWinAnsi(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, "-");
}

/**
 * Fecha larga en hora de Madrid.
 *
 * El documento se lee en la clínica, no en UTC: una receta emitida a las 00:30
 * no puede imprimir la fecha del día anterior.
 */
export function formatLongDateTime(iso: string | null): string {
  if (iso === null) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}
