/**
 * Tests de la URL de cotejo de la AEAT y las constantes de modo NO VERI*FACTU
 * (`@/lib/invoicing/verifactu-url`).
 *
 * Verifica el contrato de la query string (orden y formato de `nif`, `numserie`,
 * `fecha`, `importe`), el percent-encoding, la selección de entorno y que la
 * `fecha`/`importe` se formatean como los firma la huella.
 */
import { describe, it, expect } from "vitest";

import {
  buildVerifactuUrl,
  VERIFACTU_LEGEND,
  VERIFACTU_MODE,
  type VerifactuQrParams,
} from "@/lib/invoicing";

const BASE: VerifactuQrParams = {
  issuerTaxId: "B12345678",
  invoiceNumber: "A-1",
  issuedAt: new Date("2026-07-14T08:30:00.000Z"),
  totalCents: 1210,
};

describe("buildVerifactuUrl", () => {
  it("apunta a producción con los parámetros en el orden y formato canónicos", () => {
    expect(buildVerifactuUrl(BASE)).toBe(
      "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR" +
        "?nif=B12345678&numserie=A-1&fecha=14-07-2026&importe=12.10",
    );
  });

  it("usa el entorno de preproducción cuando se pide", () => {
    const url = buildVerifactuUrl({ ...BASE, environment: "test" });
    expect(url).toContain("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR");
    expect(url).toContain("fecha=14-07-2026");
  });

  it("codifica los caracteres especiales del número de serie", () => {
    const url = buildVerifactuUrl({ ...BASE, invoiceNumber: "FA/2026-1" });
    // '/' → %2F en la query string.
    expect(url).toContain("numserie=FA%2F2026-1");
  });

  it("formatea el importe con 2 decimales y punto decimal", () => {
    expect(buildVerifactuUrl({ ...BASE, totalCents: 100000 })).toContain("importe=1000.00");
    expect(buildVerifactuUrl({ ...BASE, totalCents: 5 })).toContain("importe=0.05");
  });
});

describe("constantes de modo NO VERI*FACTU", () => {
  it("expone la leyenda y el modo esperados", () => {
    expect(VERIFACTU_LEGEND).toBe("NO VERI*FACTU");
    expect(VERIFACTU_MODE).toBe("NO_VERIFACTU");
  });
});
