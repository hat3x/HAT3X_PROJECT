/**
 * Tests unitarios de la huella y el encadenamiento SHA-256 (`@/lib/invoicing`).
 *
 * Cubre el núcleo legal de Veri*factu:
 *   · cadena canónica con orden y formato de campos FIJOS (parte del contrato);
 *   · huella SHA-256 determinista, hex mayúsculas de 64 caracteres;
 *   · el encadenamiento: incluir la huella anterior cambia la huella actual;
 *   · verificación de cadena: detecta manipulación y eslabones rotos.
 */
import { createHash } from "node:crypto";

import { describe, it, expect } from "vitest";

import {
  buildCanonicalString,
  computeInvoiceHash,
  verifyHashChain,
  type HashableInvoiceRecord,
} from "@/lib/invoicing";

const BASE: HashableInvoiceRecord = {
  issuerTaxId: "B12345678",
  invoiceNumber: "A-2026-1",
  issuedAt: new Date("2026-07-14T08:30:00.000Z"),
  invoiceCode: "F2",
  taxCents: 210,
  totalCents: 1210,
  previousHash: null,
  generatedAt: new Date("2026-07-14T10:00:00.000Z"),
};

describe("buildCanonicalString — cadena canónica firmable", () => {
  it("respeta el orden y el formato de campos Veri*factu", () => {
    expect(buildCanonicalString(BASE)).toBe(
      "IDEmisorFactura=B12345678&NumSerieFactura=A-2026-1&" +
        "FechaExpedicionFactura=14-07-2026&TipoFactura=F2&" +
        "CuotaTotal=2.10&ImporteTotal=12.10&Huella=&" +
        "FechaHoraHusoGenRegistro=2026-07-14T10:00:00.000Z",
    );
  });

  it("formatea importes en euros con 2 decimales desde céntimos enteros", () => {
    const canonical = buildCanonicalString({
      ...BASE,
      taxCents: 5,
      totalCents: 100000,
    });
    expect(canonical).toContain("CuotaTotal=0.05");
    expect(canonical).toContain("ImporteTotal=1000.00");
  });

  it("incluye la huella anterior cuando el registro está encadenado", () => {
    const previousHash = "A".repeat(64);
    expect(buildCanonicalString({ ...BASE, previousHash })).toContain(
      `Huella=${previousHash}`,
    );
  });
});

describe("computeInvoiceHash — huella SHA-256", () => {
  it("devuelve 64 hex en mayúsculas (compatible con el CHECK de la BD)", () => {
    const hash = computeInvoiceHash(BASE);
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
  });

  it("es determinista y coincide con SHA-256 de la cadena canónica", () => {
    const expected = createHash("sha256")
      .update(buildCanonicalString(BASE), "utf8")
      .digest("hex")
      .toUpperCase();
    expect(computeInvoiceHash(BASE)).toBe(expected);
    expect(computeInvoiceHash(BASE)).toBe(computeInvoiceHash(BASE));
  });

  it("cambia si cambia cualquier campo firmado (total, huella anterior…)", () => {
    const baseHash = computeInvoiceHash(BASE);
    expect(computeInvoiceHash({ ...BASE, totalCents: 1211 })).not.toBe(baseHash);
    expect(computeInvoiceHash({ ...BASE, previousHash: "F".repeat(64) })).not.toBe(
      baseHash,
    );
    expect(computeInvoiceHash({ ...BASE, invoiceCode: "F1" })).not.toBe(baseHash);
  });
});

describe("verifyHashChain — integridad de la cadena", () => {
  /** Construye un registro con su huella ya calculada y encadenada. */
  function link(
    record: HashableInvoiceRecord,
  ): HashableInvoiceRecord & { currentHash: string } {
    return { ...record, currentHash: computeInvoiceHash(record) };
  }

  it("acepta una cadena bien encadenada (devuelve -1)", () => {
    const first = link(BASE);
    const second = link({
      ...BASE,
      invoiceNumber: "A-2026-2",
      totalCents: 2420,
      taxCents: 420,
      previousHash: first.currentHash,
    });
    expect(verifyHashChain([first, second])).toBe(-1);
  });

  it("detecta un registro manipulado (huella que ya no cuadra)", () => {
    const first = link(BASE);
    const tampered = { ...first, totalCents: 9999 }; // se altera tras firmar
    expect(verifyHashChain([tampered])).toBe(0);
  });

  it("detecta un eslabón roto (previous_hash que no apunta al anterior)", () => {
    const first = link(BASE);
    const second = link({
      ...BASE,
      invoiceNumber: "A-2026-2",
      previousHash: "0".repeat(64), // no es la huella del primero
    });
    expect(verifyHashChain([first, second])).toBe(1);
  });
});
