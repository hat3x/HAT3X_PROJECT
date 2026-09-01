import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

import { formatLongDateTime, toWinAnsi, wrap } from "@/lib/dental/pdf-text";

/**
 * PDF de la receta privada.
 *
 * ── QUÉ TIENE QUE LLEVAR ────────────────────────────────────────────────────
 * El Real Decreto 1718/2010 fija los datos mínimos para que una farmacia
 * dispense: identificación del prescriptor CON SU NÚMERO DE COLEGIADO, datos
 * del paciente, y de cada medicamento su principio activo, forma farmacéutica,
 * vía, dosis, frecuencia y duración.
 *
 * ── Y QUÉ PASA SI FALTAN ────────────────────────────────────────────────────
 * El documento lo DICE, en vez de salir bonito y que el paciente se lleve el
 * chasco en el mostrador. Un papel que parece una receta y no lo es hace más
 * daño que no imprimir nada: el paciente se va convencido de que tiene su
 * medicación resuelta.
 *
 * ── LO QUE ESTO NO ES ───────────────────────────────────────────────────────
 * No es receta electrónica. Esa necesita homologación en el SREP, el sistema
 * del Consejo General de Colegios de Farmacéuticos, que es un trámite con un
 * tercero. Esto es la receta en papel, firmada a mano por el prescriptor.
 */

export interface PrescriptionPdfMedication {
  medication: string;
  activeIngredient: string | null;
  pharmaceuticalForm: string | null;
  route: string | null;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
}

export interface PrescriptionPdfInput {
  salonName: string;
  salonTaxId: string | null;
  salonAddress: string | null;
  patientName: string;
  patientTaxId: string | null;
  patientBirthDate: string | null;
  prescriberName: string | null;
  prescriberLicense: string | null;
  prescriberAuthority: string | null;
  diagnosis: string | null;
  notes: string | null;
  issuedAt: string | null;
  medications: readonly PrescriptionPdfMedication[];
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = 14;

/**
 * Qué le falta a esta receta para ser dispensable.
 *
 * Se calcula aparte y se exporta para poder probarlo sin generar un PDF, y para
 * que la pantalla pueda avisar ANTES de imprimir en vez de después.
 */
export function missingLegalFields(input: PrescriptionPdfInput): string[] {
  const faltan: string[] = [];

  if ((input.prescriberName ?? "").trim() === "") faltan.push("el nombre del prescriptor");
  if ((input.prescriberLicense ?? "").trim() === "") faltan.push("su número de colegiado");
  if ((input.patientTaxId ?? "").trim() === "") faltan.push("el DNI del paciente");

  // Basta que UNA línea no tenga principio activo: la farmacia no puede
  // dispensar equivalente de lo que no sabe qué es.
  const sinPrincipio = input.medications.some(
    (m) => (m.activeIngredient ?? "").trim() === "",
  );
  if (sinPrincipio) faltan.push("el principio activo de alguna medicación");

  return faltan;
}

function formatBirthDate(iso: string | null): string {
  if (iso === null) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(iso));
}

/** Une los datos de posología que existan, en el orden en que se leen. */
function posologia(m: PrescriptionPdfMedication): string {
  return [m.dose, m.frequency, m.duration]
    .map((x) => (x ?? "").trim())
    .filter((x) => x !== "")
    .join(" · ");
}

export async function buildPrescriptionPdf(
  input: PrescriptionPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE.width - MARGIN * 2;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const ensureSpace = (needed: number): void => {
    if (y - needed >= MARGIN) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const writeLine = (text: string, size = BODY_SIZE, useBold = false): void => {
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

  const separador = (): void => {
    ensureSpace(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.8, 0.85, 0.85),
    });
    y -= 16;
  };

  // ── Cabecera: la clínica ──────────────────────────────────────────────────
  writeLine(input.salonName, 12, true);
  if (input.salonAddress !== null) writeLine(input.salonAddress, 9);
  if (input.salonTaxId !== null) writeLine(`NIF: ${input.salonTaxId}`, 9);
  y -= 8;

  ensureSpace(24);
  page.drawText("RECETA", { x: MARGIN, y, size: 18, font: bold });
  y -= 26;

  // ── El aviso, ARRIBA ──────────────────────────────────────────────────────
  // Va antes que nada a propósito: si el documento no sirve, quien lo imprime
  // tiene que verlo antes de dárselo al paciente, no en la última página.
  const faltan = missingLegalFields(input);
  if (faltan.length > 0) {
    ensureSpace(46);
    page.drawRectangle({
      x: MARGIN - 6,
      y: y - 34,
      width: contentWidth + 12,
      height: 44,
      color: rgb(0.99, 0.93, 0.93),
      borderColor: rgb(0.75, 0.2, 0.2),
      borderWidth: 1,
    });
    y -= 4;
    writeLine("NO VALIDA PARA DISPENSACION EN FARMACIA", 10, true);
    for (const linea of wrap(
      `Faltan ${faltan.join(", ")}. Sirve como indicacion de tratamiento, no como receta.`,
      font,
      8.5,
      contentWidth,
    )) {
      writeLine(linea, 8.5);
    }
    y -= 12;
  }

  // ── Paciente ──────────────────────────────────────────────────────────────
  separador();
  writeLine("PACIENTE", 8, true);
  writeLine(input.patientName, 11);
  writeLine(`DNI/NIF: ${input.patientTaxId ?? "—"}`, 9);
  writeLine(`Fecha de nacimiento: ${formatBirthDate(input.patientBirthDate)}`, 9);
  y -= 6;

  // ── Prescriptor ───────────────────────────────────────────────────────────
  writeLine("PRESCRIPTOR", 8, true);
  writeLine(input.prescriberName ?? "—", 11);
  writeLine(`N.o de colegiado: ${input.prescriberLicense ?? "—"}`, 9);
  if (input.prescriberAuthority !== null) writeLine(input.prescriberAuthority, 9);
  writeLine(`Fecha de emision: ${formatLongDateTime(input.issuedAt)}`, 9);
  y -= 6;

  if (input.diagnosis !== null && input.diagnosis.trim() !== "") {
    writeLine("DIAGNOSTICO", 8, true);
    for (const linea of wrap(input.diagnosis, font, BODY_SIZE, contentWidth)) {
      writeLine(linea);
    }
    y -= 6;
  }

  // ── Medicación ────────────────────────────────────────────────────────────
  separador();
  writeLine("MEDICACION", 8, true);
  y -= 4;

  input.medications.forEach((m, i) => {
    // Cada medicamento entero o en la página siguiente: partir una posología
    // entre dos hojas es como se toma mal una medicación.
    ensureSpace(LINE_HEIGHT * 5);

    // El principio activo manda: es lo que la farmacia dispensa. El nombre
    // comercial va detrás, entre paréntesis, como referencia.
    const principio = (m.activeIngredient ?? "").trim();
    const titulo =
      principio === "" ? m.medication : `${principio} (${m.medication})`;
    writeLine(`${i + 1}. ${titulo}`, 11, true);

    const forma = [m.pharmaceuticalForm, m.route]
      .map((x) => (x ?? "").trim())
      .filter((x) => x !== "")
      .join(" · ");
    if (forma !== "") writeLine(`   ${forma}`, 9);

    const pauta = posologia(m);
    if (pauta !== "") writeLine(`   ${pauta}`, 9);

    if ((m.quantity ?? "").trim() !== "") writeLine(`   Cantidad: ${m.quantity}`, 9);

    if ((m.instructions ?? "").trim() !== "") {
      for (const linea of wrap(`   ${m.instructions}`, font, 9, contentWidth)) {
        writeLine(linea, 9);
      }
    }
    y -= 8;
  });

  if (input.notes !== null && input.notes.trim() !== "") {
    separador();
    writeLine("OBSERVACIONES", 8, true);
    for (const linea of wrap(input.notes, font, 9, contentWidth)) writeLine(linea, 9);
  }

  // ── Firma ─────────────────────────────────────────────────────────────────
  // A mano, sobre el papel: la receta la firma el prescriptor, y ese trazo es
  // lo que la farmacia comprueba. La aplicación no lo puede suplantar.
  y -= 20;
  ensureSpace(80);
  page.drawLine({
    start: { x: PAGE.width - MARGIN - 200, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 0.7,
    color: rgb(0.4, 0.45, 0.45),
  });
  y -= 12;
  page.drawText(toWinAnsi("Firma del prescriptor"), {
    x: PAGE.width - MARGIN - 200,
    y,
    size: 8,
    font,
    color: rgb(0.45, 0.5, 0.5),
  });

  return doc.save();
}
