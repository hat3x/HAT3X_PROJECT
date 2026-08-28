/**
 * PDF del consentimiento firmado (A2).
 *
 * Es el documento que se archiva y el que se imprime si alguien lo reclama. Lo
 * que se prueba aquí es que sale un PDF de verdad, que el texto largo no se
 * pierde por el borde inferior, y que el documento se genera igual para los
 * consentimientos antiguos que no tienen trazo.
 *
 * Lo de la paginación no es cosmético: los consentimientos de implante o
 * endodoncia ocupan varias páginas, y si el texto se saliera del folio el
 * documento archivado no recogería lo que el paciente aceptó.
 */
import { PDFDocument } from "pdf-lib";
import { describe, it, expect } from "vitest";

import { buildConsentPdf } from "@/lib/dental/consent-pdf";
import type { SignatureStroke } from "@/lib/dental/signature";

const RUBRICA: SignatureStroke[] = [
  [
    { x: 10, y: 40, p: 0.3, t: 0 },
    { x: 18, y: 22, p: 0.6, t: 16 },
    { x: 26, y: 48, p: 0.7, t: 32 },
    { x: 34, y: 20, p: 0.8, t: 48 },
    { x: 42, y: 50, p: 0.7, t: 64 },
    { x: 51, y: 24, p: 0.6, t: 80 },
  ],
];

const CONSENTIMIENTO = {
  title: "Consentimiento informado para implante dental",
  body: "Se me ha explicado el procedimiento, sus alternativas y sus riesgos.",
  templateVersion: "v1",
  signedByPatient: "Juan Pérez",
  signedAt: "2026-08-28T09:30:00.000Z",
  signatureHash: "a".repeat(64),
  salonName: "Clínica Dental de Prueba",
  strokes: RUBRICA,
};

describe("buildConsentPdf", () => {
  it("produce un PDF válido", async () => {
    const bytes = await buildConsentPdf(CONSENTIMIENTO);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    // Un PDF con texto y un trazo no baja de unos kilobytes; si saliera casi
    // vacío sería que no se dibujó nada.
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("se puede volver a abrir y tiene al menos una página", async () => {
    const bytes = await buildConsentPdf(CONSENTIMIENTO);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("un consentimiento largo pagina en vez de perder texto por abajo", async () => {
    const largo = {
      ...CONSENTIMIENTO,
      body: Array.from(
        { length: 220 },
        (_, i) => `Punto ${i + 1}: informacion relevante sobre el tratamiento propuesto.`,
      ).join("\n"),
    };

    const doc = await PDFDocument.load(await buildConsentPdf(largo));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("funciona sin trazo, para los consentimientos anteriores a la firma manuscrita", async () => {
    // Los 62 firmados con el modelo viejo también se pueden imprimir: el PDF
    // debe salir marcando que no hay trazo, en vez de reventar.
    const sinTrazo = { ...CONSENTIMIENTO, strokes: [], signatureHash: null };

    const bytes = await buildConsentPdf(sinTrazo);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("no revienta si el cuerpo viene vacío", async () => {
    const bytes = await buildConsentPdf({ ...CONSENTIMIENTO, body: null });
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});
