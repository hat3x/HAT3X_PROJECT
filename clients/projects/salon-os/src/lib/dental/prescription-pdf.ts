import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

import { formatLongDateTime, toWinAnsi, wrap } from "@/lib/dental/pdf-text";

/**
 * Hoja para transcribir a la receta oficial del Colegio.
 *
 * ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
 * NO es una receta. La receta es el impreso del Ilustre Colegio Oficial de
 * Odontólogos y Estomatólogos, que viene con su número, su código de barras y
 * su QR ya impresos: los asigna el Colegio. Fabricarlos sería falsificar un
 * documento oficial, así que Kairos no imita ese impreso.
 *
 * En Biodental el impreso se rellena a mano. Lo que aporta Kairos es esta hoja:
 * los mismos datos, en el MISMO ORDEN y con las MISMAS PALABRAS que el impreso,
 * para que copiarlos sea mecánico y no haya que ir buscando cada dato por la
 * ficha.
 *
 * ── UN IMPRESO POR MEDICAMENTO ──────────────────────────────────────────────
 * El impreso tiene UN bloque de prescripción y su pie dice que vale para una
 * única dispensación. Una receta de Kairos con tres medicamentos necesita tres
 * impresos. La hoja lo dice arriba, porque es el error fácil de cometer.
 *
 * ── Y SI FALTAN DATOS ───────────────────────────────────────────────────────
 * Los enumera antes de la tabla. Enterarse de que falta el DNI mientras se
 * copia es mucho mejor que enterarse en el mostrador de la farmacia.
 */

export interface PrescriptionPdfMedication {
  /** DCI (principio activo) o marca, como lo pide el impreso. */
  medication: string;
  activeIngredient: string | null;
  pharmaceuticalForm: string | null;
  route: string | null;
  /** Dosis por unidad. */
  dose: string | null;
  /** Unidades por envase, p. ej. "12 comprimidos". */
  unitsPerPackage: string | null;
  /** Pauta: "cada 8 horas". */
  frequency: string | null;
  /** Duración del tratamiento. */
  duration: string | null;
  /** Núm. de envases o unidades. */
  quantity: string | null;
  /** Va a "Información al Farmacéutico". */
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
  prescriberAddress: string | null;
  prescriberEmail: string | null;
  prescriberPhone: string | null;
  diagnosis: string | null;
  notes: string | null;
  issuedAt: string | null;
  medications: readonly PrescriptionPdfMedication[];
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 52;
const BODY = 10;
const LINE = 13.5;

/**
 * Qué datos le faltan a esta receta para poder copiarla al impreso.
 *
 * Se calcula aparte y se exporta para poder probarlo sin generar un PDF, y para
 * que la pantalla pueda avisar antes de imprimir.
 */
export function missingLegalFields(input: PrescriptionPdfInput): string[] {
  const faltan: string[] = [];
  const vacio = (x: string | null): boolean => (x ?? "").trim() === "";

  if (vacio(input.prescriberName)) faltan.push("el nombre del prescriptor");
  if (vacio(input.prescriberLicense)) faltan.push("su número de colegiado");
  if (vacio(input.patientTaxId)) faltan.push("el DNI del paciente");
  if (input.patientBirthDate === null) faltan.push("el año de nacimiento del paciente");

  // Basta que UNA línea no tenga principio activo: el impreso pide "DCI o
  // marca", y sin la DCI la farmacia no puede dispensar un equivalente.
  if (input.medications.some((m) => vacio(m.activeIngredient))) {
    faltan.push("el principio activo de alguna medicación");
  }

  return faltan;
}

/** El impreso pide el AÑO de nacimiento, no la fecha completa. */
function birthYear(iso: string | null): string {
  if (iso === null) return "—";
  return String(new Date(iso).getFullYear());
}

export async function buildPrescriptionPdf(
  input: PrescriptionPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ancho = PAGE.width - MARGIN * 2;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const hueco = (necesario: number): void => {
    if (y - necesario >= MARGIN) return;
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const linea = (texto: string, size = BODY, negrita = false, sangria = 0): void => {
    hueco(LINE);
    page.drawText(toWinAnsi(texto), {
      x: MARGIN + sangria,
      y,
      size,
      font: negrita ? bold : font,
      color: rgb(0.07, 0.1, 0.11),
    });
    y -= LINE;
  };

  /** Etiqueta y valor en la misma fila, como en las casillas del impreso. */
  const campo = (etiqueta: string, valor: string | null, sangria = 0): void => {
    hueco(LINE);
    const x = MARGIN + sangria;
    page.drawText(toWinAnsi(etiqueta), { x, y, size: 8, font, color: rgb(0.42, 0.45, 0.5) });
    page.drawText(toWinAnsi((valor ?? "").trim() === "" ? "—" : valor!), {
      x: x + 132,
      y,
      size: BODY,
      font: bold,
      color: rgb(0.07, 0.1, 0.11),
    });
    y -= LINE;
  };

  const bloque = (titulo: string): void => {
    y -= 6;
    hueco(LINE + 8);
    page.drawLine({
      start: { x: MARGIN, y: y + 11 },
      end: { x: PAGE.width - MARGIN, y: y + 11 },
      thickness: 0.5,
      color: rgb(0.8, 0.84, 0.85),
    });
    linea(titulo, 8.5, true);
    y -= 2;
  };

  // ── Cabecera ──────────────────────────────────────────────────────────────
  linea(input.salonName, 11, true);
  if (input.salonAddress !== null) linea(input.salonAddress, 8.5);
  y -= 6;

  hueco(24);
  page.drawText(toWinAnsi("HOJA PARA TRANSCRIBIR A LA RECETA OFICIAL"), {
    x: MARGIN,
    y,
    size: 15,
    font: bold,
  });
  y -= 20;

  for (const l of wrap(
    "Este papel NO es una receta. Copia estos datos al impreso del Colegio, que es el que " +
      "lleva su numero, su codigo de barras y la validez ante la farmacia.",
    font,
    8.5,
    ancho,
  )) {
    linea(l, 8.5);
  }
  y -= 4;

  // ── Cuántos impresos hacen falta ──────────────────────────────────────────
  // El impreso tiene un solo bloque de prescripcion: un medicamento por hoja.
  const n = input.medications.length;
  if (n > 1) {
    hueco(30);
    page.drawRectangle({
      x: MARGIN - 5,
      y: y - 16,
      width: ancho + 10,
      height: 26,
      color: rgb(0.99, 0.96, 0.9),
      borderColor: rgb(0.7, 0.53, 0.16),
      borderWidth: 0.8,
    });
    linea(
      `ATENCION: ${n} medicamentos = ${n} impresos. Cada impreso vale para UNA dispensacion.`,
      9,
      true,
    );
    y -= 12;
  }

  // ── Lo que falta ──────────────────────────────────────────────────────────
  const faltan = missingLegalFields(input);
  if (faltan.length > 0) {
    hueco(40);
    page.drawRectangle({
      x: MARGIN - 5,
      y: y - 24,
      width: ancho + 10,
      height: 34,
      color: rgb(0.99, 0.93, 0.93),
      borderColor: rgb(0.75, 0.2, 0.2),
      borderWidth: 0.9,
    });
    linea("FALTAN DATOS PARA QUE LA FARMACIA LA ACEPTE", 9, true);
    for (const l of wrap(`Sin ${faltan.join(", ")}.`, font, 8.5, ancho)) linea(l, 8.5);
    y -= 12;
  }

  // ── Paciente ──────────────────────────────────────────────────────────────
  // Mismo orden y mismas palabras que el impreso, para que copiar sea mecanico.
  bloque("PACIENTE  (nombre, apellidos, ano de nacimiento y n.o de DNI / NIE / pasaporte)");
  campo("Nombre y apellidos", input.patientName);
  campo("Ano de nacimiento", birthYear(input.patientBirthDate));
  campo("DNI / NIE", input.patientTaxId);

  // ── Prescriptor ───────────────────────────────────────────────────────────
  bloque("PRESCRIPTOR  (datos de identificacion y firma)");
  campo("Dr. / Dra.", input.prescriberName);
  campo("Num. Colegiado", input.prescriberLicense);
  campo("Direccion", input.prescriberAddress);
  campo("Email", input.prescriberEmail);
  campo("Tlfno / Fax", input.prescriberPhone);
  campo("Fecha de prescripcion", formatLongDateTime(input.issuedAt));
  if (input.prescriberAuthority !== null) {
    for (const l of wrap(input.prescriberAuthority, font, 8, ancho)) linea(l, 8);
  }

  if ((input.diagnosis ?? "").trim() !== "") {
    bloque("DIAGNOSTICO  (no va en el impreso; para la historia clinica)");
    for (const l of wrap(input.diagnosis!, font, BODY, ancho)) linea(l);
  }

  // ── Prescripción, un bloque por medicamento ───────────────────────────────
  input.medications.forEach((m, i) => {
    bloque(
      n > 1
        ? `PRESCRIPCION ${i + 1} de ${n}  ->  IMPRESO ${i + 1}`
        : "PRESCRIPCION",
    );
    // Entero en la misma pagina: una posologia partida en dos hojas es como se
    // copia mal una medicacion.
    hueco(LINE * 7);

    campo("DCI o marca", m.activeIngredient ?? m.medication);
    if ((m.activeIngredient ?? "").trim() !== "" && m.medication.trim() !== "") {
      campo("Marca comercial", m.medication);
    }
    campo("Forma farmaceutica", m.pharmaceuticalForm);
    campo("Via de administracion", m.route);
    campo("Dosis por unidad", m.dose);
    campo("Unidades por envase", m.unitsPerPackage);
    campo("Num. envases / unidades", m.quantity);
    campo("Duracion del tratamiento", m.duration);
    campo("Posologia (pauta)", m.frequency);

    if ((m.instructions ?? "").trim() !== "") {
      y -= 2;
      linea("Informacion al Farmaceutico", 8, true);
      for (const l of wrap(m.instructions!, font, 9, ancho)) linea(l, 9);
    }
  });

  if ((input.notes ?? "").trim() !== "") {
    bloque("OBSERVACIONES  (no van en el impreso)");
    for (const l of wrap(input.notes!, font, 9, ancho)) linea(l, 9);
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  y -= 10;
  hueco(30);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.8, 0.84, 0.85),
  });
  y -= 12;
  for (const l of wrap(
    "La receta la firma el prescriptor sobre el impreso del Colegio. Segun su pie, la validez " +
      "expira a los 10 dias naturales de la fecha prevista de dispensacion o, en su defecto, de " +
      "la fecha de prescripcion.",
    font,
    7.5,
    ancho,
  )) {
    linea(l, 7.5);
  }

  return doc.save();
}
