import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ClinicConfig, ClinicDocument } from "./store";
import { computeTotals } from "./store";

const EUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function docLabel(d: ClinicDocument) {
  return d.type === "factura"
    ? "FACTURA"
    : d.type === "presupuesto"
    ? "PRESUPUESTO"
    : "RECIBO";
}

export function generateDocumentPdf(doc: ClinicDocument, clinic: ClinicConfig) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const margin = 16;

  // Header band
  pdf.setFillColor(245, 247, 252);
  pdf.rect(0, 0, W, 38, "F");

  // Logo (initials chip)
  pdf.setFillColor(59, 130, 246);
  pdf.roundedRect(margin, 10, 18, 18, 4, 4, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(clinic.logoInitials || "CL", margin + 9, 21.5, { align: "center" });

  // Clinic name
  pdf.setTextColor(20, 25, 40);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(clinic.name || "Clínica", margin + 24, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(
    [clinic.address, `CIF ${clinic.cif}`, `${clinic.phone} · ${clinic.email}`]
      .filter(Boolean)
      .join("  ·  "),
    margin + 24,
    24,
  );

  // Doc type & number top-right
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(20, 25, 40);
  pdf.text(docLabel(doc), W - margin, 18, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.text(`Nº ${doc.number}`, W - margin, 24, { align: "right" });
  pdf.text(
    `Fecha: ${new Date(doc.date).toLocaleDateString("es-ES")}`,
    W - margin,
    29,
    { align: "right" },
  );

  // Patient block
  pdf.setDrawColor(230);
  pdf.setFillColor(252, 253, 255);
  pdf.roundedRect(margin, 48, W - margin * 2, 22, 3, 3, "FD");
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text("PACIENTE", margin + 5, 54);
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(20, 25, 40);
  pdf.text(doc.patientName, margin + 5, 61);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(`Estado: ${doc.status.toUpperCase()}`, W - margin - 5, 61, {
    align: "right",
  });

  // Items table
  const { base, tax, total } = computeTotals(doc);
  autoTable(pdf, {
    startY: 78,
    margin: { left: margin, right: margin },
    head: [["Concepto", "Cant.", "Precio", "Subtotal"]],
    body: doc.items.map((i) => [
      i.concept,
      String(i.qty),
      EUR(i.price),
      EUR(i.qty * i.price),
    ]),
    styles: { font: "helvetica", fontSize: 10, cellPadding: 3.5 },
    headStyles: {
      fillColor: [240, 244, 250],
      textColor: [40, 50, 70],
      lineWidth: 0,
    },
    columnStyles: {
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 32 },
    },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    theme: "plain",
  });

  let y = (pdf as any).lastAutoTable.finalY + 6;

  // Totals
  const totalsX = W - margin - 60;
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.text("Base", totalsX, y + 5);
  pdf.text(EUR(base), W - margin, y + 5, { align: "right" });
  pdf.text(`IVA (${doc.vat}%)`, totalsX, y + 11);
  pdf.text(EUR(tax), W - margin, y + 11, { align: "right" });
  pdf.setDrawColor(220);
  pdf.line(totalsX, y + 14, W - margin, y + 14);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(20, 25, 40);
  pdf.text("TOTAL", totalsX, y + 22);
  pdf.text(EUR(total), W - margin, y + 22, { align: "right" });

  y += 32;

  if (doc.notes) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(80);
    pdf.text("Notas:", margin, y);
    pdf.setTextColor(100);
    const split = pdf.splitTextToSize(doc.notes, W - margin * 2);
    pdf.text(split, margin, y + 5);
    y += 5 + split.length * 4;
  }

  if (doc.nextReview) {
    pdf.setTextColor(80);
    pdf.text(
      `Próxima revisión: ${new Date(doc.nextReview).toLocaleDateString("es-ES")}`,
      margin,
      y + 8,
    );
  }

  // Signature
  const sigY = pdf.internal.pageSize.getHeight() - 30;
  pdf.setDrawColor(200);
  pdf.line(margin, sigY, margin + 60, sigY);
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text("Firma profesional", margin, sigY + 4);

  pdf.line(W - margin - 60, sigY, W - margin, sigY);
  pdf.text("Firma paciente", W - margin - 60, sigY + 4);

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(160);
  pdf.text(
    `${clinic.name || "Clínica"} · ${docLabel(doc)} ${doc.number} · Generado con ClinicApp`,
    W / 2,
    pdf.internal.pageSize.getHeight() - 8,
    { align: "center" },
  );

  return pdf;
}

export function downloadPdf(doc: ClinicDocument, clinic: ClinicConfig) {
  const pdf = generateDocumentPdf(doc, clinic);
  pdf.save(`${doc.type}-${doc.number}.pdf`);
}

export function previewPdfBlobUrl(doc: ClinicDocument, clinic: ClinicConfig) {
  const pdf = generateDocumentPdf(doc, clinic);
  return pdf.output("bloburl") as unknown as string;
}