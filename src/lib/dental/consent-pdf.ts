import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { signatureBounds, strokesToSvgPath, type SignatureStroke } from "@/lib/dental/signature";

/**
 * PDF del consentimiento firmado (A2).
 *
 * Es el documento que se archiva y el que se imprime si alguien lo reclama. Por
 * eso lleva dentro TODO lo necesario para comprobarlo sin abrir la aplicación:
 * el texto exacto que se firmó, la versión de plantilla, quién firmó, cuándo, su
 * trazo, y el sello SHA-256 del contenido. Un PDF que dijera "firmado" sin poder
 * verificar QUÉ se firmó no valdría más que una captura de pantalla.
 *
 * Los consentimientos antiguos —los 62 firmados con el modelo viejo, solo con el
 * nombre tecleado— también se imprimen: el documento lo dice en vez de fingir
 * que son equivalentes.
 */

export interface ConsentPdfInput {
  title: string;
  body: string | null;
  templateVersion: string;
  signedByPatient: string | null;
  signedAt: string | null;
  signatureHash: string | null;
  salonName: string;
  strokes: SignatureStroke[];
}

/** A4 en puntos, y márgenes cómodos para leer e imprimir. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 14;

/**
 * Parte un texto en líneas que caben en el ancho dado.
 *
 * Se respetan los saltos de línea del original: un consentimiento suele venir
 * con puntos numerados, y unirlos en un párrafo corrido lo haría ilegible justo
 * donde el paciente tiene que poder seguirlo.
 */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
function toWinAnsi(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, "-");
}

function formatSignedAt(iso: string | null): string {
  if (iso === null) return "—";
  // Hora de Madrid: el documento se lee en la clínica, no en UTC.
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE.width - MARGIN * 2;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  /** Reserva espacio; si no cabe, abre página nueva. Así nada se pierde por abajo. */
  const ensureSpace = (needed: number): void => {
    if (y - needed >= MARGIN) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const writeLine = (text: string, size: number, useBold = false): void => {
    ensureSpace(LINE_HEIGHT);
    page.drawText(toWinAnsi(text), {
      x: MARGIN,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.07, 0.1, 0.11),
    });
    y -= LINE_HEIGHT;
  };

  // Cabecera
  writeLine(input.salonName, 9);
  y -= 6;
  for (const line of wrap(input.title, bold, 15, contentWidth)) {
    ensureSpace(20);
    page.drawText(toWinAnsi(line), { x: MARGIN, y, size: 15, font: bold });
    y -= 20;
  }
  y -= 10;

  // Cuerpo: el texto EXACTO que se firmó.
  const body = input.body ?? "";
  for (const line of wrap(body, font, BODY_SIZE, contentWidth)) {
    writeLine(line, BODY_SIZE);
  }

  // Bloque de firma. Se reserva de una vez para que no quede partido entre dos
  // páginas: una firma separada de su nombre y su fecha no se sostiene.
  y -= 18;
  ensureSpace(150);

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.85, 0.85),
  });
  y -= 22;

  writeLine("Firmado por", 9, true);
  writeLine(input.signedByPatient ?? "—", 11);
  y -= 4;
  writeLine("Fecha", 9, true);
  writeLine(formatSignedAt(input.signedAt), 11);
  y -= 10;

  // El trazo, dibujado a partir del mismo path que se archiva como SVG.
  const bounds = signatureBounds(input.strokes);
  if (bounds !== null) {
    const d = strokesToSvgPath(input.strokes);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min(60 / height, 2);

    ensureSpace(80);
    page.drawSvgPath(d, {
      x: MARGIN - bounds.minX * scale,
      y: y - 6,
      scale,
      borderColor: rgb(0.07, 0.1, 0.11),
      borderWidth: 1.2,
    });
    y -= 74;
  } else {
    writeLine(
      "Consentimiento anterior a la firma manuscrita: no se capturo trazo.",
      9,
    );
    y -= 6;
  }

  // Sello: lo que permite comprobar el documento sin abrir la aplicación.
  writeLine("Sello del contenido (SHA-256)", 8, true);
  writeLine(input.signatureHash ?? "sin sello", 8);
  writeLine(`Version de plantilla: ${input.templateVersion}`, 8);

  return doc.save();
}
