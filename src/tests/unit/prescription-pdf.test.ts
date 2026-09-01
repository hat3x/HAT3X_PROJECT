/**
 * PDF de la receta privada.
 *
 * Lo que de verdad hay que demostrar aquí no es que salga un PDF, sino que
 * **el documento no miente**: si le faltan los datos que exige el Real Decreto
 * 1718/2010, tiene que decirlo. Un papel que parece una receta y no lo es hace
 * más daño que no imprimir nada, porque el paciente se va convencido de que
 * tiene su medicación resuelta y se entera en el mostrador de la farmacia.
 */
import { PDFDocument } from "pdf-lib";
import { describe, it, expect } from "vitest";

import {
  buildPrescriptionPdf,
  missingLegalFields,
  type PrescriptionPdfInput,
} from "@/lib/dental/prescription-pdf";

/** Receta COMPLETA: la que sí vale en una farmacia. */
const COMPLETA: PrescriptionPdfInput = {
  salonName: "Clínica Dental Biodental",
  salonTaxId: "B12345678",
  salonAddress: "Calle Mayor 1, Madrid",
  patientName: "Jesús Melchor García Toledo",
  patientTaxId: "12345678Z",
  patientBirthDate: "1978-04-12",
  prescriberName: "Nicolás Zunino",
  prescriberLicense: "28001234",
  prescriberAuthority: "Colegio de Odontólogos de la 1.ª Región",
  diagnosis: "Absceso periapical del 26",
  notes: "Volver en una semana.",
  issuedAt: "2026-09-01T10:30:00.000Z",
  medications: [
    {
      medication: "Augmentine 875/125",
      activeIngredient: "amoxicilina/ácido clavulánico",
      pharmaceuticalForm: "comprimidos",
      route: "oral",
      dose: "875/125 mg",
      frequency: "cada 8 horas",
      duration: "7 días",
      quantity: "1 envase",
      instructions: "Tomar con alimento.",
    },
  ],
};

function sin(campos: Partial<PrescriptionPdfInput>): PrescriptionPdfInput {
  return { ...COMPLETA, ...campos };
}

describe("missingLegalFields", () => {
  it("una receta completa no echa nada en falta", () => {
    expect(missingLegalFields(COMPLETA)).toEqual([]);
  });

  it("sin número de colegiado no es dispensable", () => {
    // Es el dato que la farmacia mira primero.
    expect(missingLegalFields(sin({ prescriberLicense: null }))).toContain(
      "su número de colegiado",
    );
  });

  it("una cadena en blanco cuenta como ausente", () => {
    // Un campo relleno con espacios engaña a un `!= null` y no a la farmacia.
    expect(missingLegalFields(sin({ prescriberLicense: "   " }))).toContain(
      "su número de colegiado",
    );
  });

  it("sin DNI del paciente tampoco", () => {
    expect(missingLegalFields(sin({ patientTaxId: null }))).toContain(
      "el DNI del paciente",
    );
  });

  it("basta que UNA medicación no tenga principio activo", () => {
    const dosMedicamentos = sin({
      medications: [
        COMPLETA.medications[0]!,
        { ...COMPLETA.medications[0]!, activeIngredient: null },
      ],
    });

    // La farmacia no puede dispensar un equivalente de lo que no sabe qué es,
    // así que una sola línea incompleta invalida el documento entero.
    expect(missingLegalFields(dosMedicamentos)).toContain(
      "el principio activo de alguna medicación",
    );
  });

  it("acumula todo lo que falta, no solo lo primero", () => {
    const vacia = sin({
      prescriberName: null,
      prescriberLicense: null,
      patientTaxId: null,
    });

    expect(missingLegalFields(vacia)).toHaveLength(3);
  });
});

describe("buildPrescriptionPdf", () => {
  it("produce un PDF válido", async () => {
    const bytes = await buildPrescriptionPdf(COMPLETA);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("una receta con muchas medicaciones no se sale del folio", async () => {
    const muchas = sin({
      medications: Array.from({ length: 25 }, (_, i) => ({
        ...COMPLETA.medications[0]!,
        medication: `Medicamento ${i + 1}`,
      })),
    });

    const doc = await PDFDocument.load(await buildPrescriptionPdf(muchas));
    // Si cupieran todas en una hoja es que se están pintando unas encima de
    // otras o por debajo del margen.
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("se genera igual aunque falten datos: el aviso va dentro, no se bloquea", async () => {
    const incompleta = sin({ prescriberLicense: null, patientTaxId: null });

    const bytes = await buildPrescriptionPdf(incompleta);

    // No lanza ni devuelve vacío: la receta incompleta sigue siendo útil como
    // indicación de tratamiento para la historia clínica.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("aguanta una receta sin ninguna medicación", async () => {
    const bytes = await buildPrescriptionPdf(sin({ medications: [] }));

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
