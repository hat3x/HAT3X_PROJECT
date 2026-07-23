/**
 * EXPORTACIÓN del libro registro — helpers puros de `@/lib/facturacion/filters`
 * (sub-8).
 *
 * Blinda dos garantías de la descarga que reutiliza `GET /api/facturacion/export`:
 *
 *   1. `invoiceExportHref` construye la URL con SOLO el periodo (`from`/`to`) y el
 *      `format`, usando los nombres de parámetro que LEE el Route Handler
 *      (`from`/`to`/`format`, no los de la tabla `desde`/`hasta`). Omite los
 *      extremos vacíos. Es la coherencia que evita descargar «lo que no es».
 *   2. `hasNonPeriodInvoiceFilters` detecta filtros que NO acotan el libro fiscal
 *      (sede/tipo/método/búsqueda) para que la UI avise de que la descarga cubre
 *      todo el periodo. El rango de fechas NO cuenta (ese sí viaja a la exportación).
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_INVOICE_FILTERS,
  hasNonPeriodInvoiceFilters,
  INVOICE_EXPORT_PATH,
  invoiceExportHref,
  type InvoiceFilters,
} from "@/lib/facturacion/filters";

/** Devuelve los searchParams de un href relativo, de forma robusta. */
function paramsOf(href: string): URLSearchParams {
  return new URL(href, "http://local.test").searchParams;
}

describe("invoiceExportHref — apunta al Route Handler correcto", () => {
  it("empieza por la ruta de exportación", () => {
    expect(invoiceExportHref("2026-01-01", "2026-03-31", "csv")).toMatch(
      new RegExp(`^${INVOICE_EXPORT_PATH}\\?`),
    );
  });
});

describe("invoiceExportHref — periodo completo (from + to)", () => {
  it("incluye from, to y format con los NOMBRES que lee el endpoint", () => {
    const params = paramsOf(invoiceExportHref("2026-01-01", "2026-03-31", "csv"));
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-03-31");
    expect(params.get("format")).toBe("csv");
  });

  it("NO usa los nombres de la tabla (desde/hasta)", () => {
    const params = paramsOf(invoiceExportHref("2026-01-01", "2026-03-31", "csv"));
    expect(params.has("desde")).toBe(false);
    expect(params.has("hasta")).toBe(false);
  });

  it("respeta el formato JSON", () => {
    const params = paramsOf(invoiceExportHref("2026-01-01", "2026-03-31", "json"));
    expect(params.get("format")).toBe("json");
  });
});

describe("invoiceExportHref — extremos independientes y sin periodo", () => {
  it("solo from: omite to", () => {
    const params = paramsOf(invoiceExportHref("2026-01-01", null, "csv"));
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.has("to")).toBe(false);
    expect(params.get("format")).toBe("csv");
  });

  it("solo to: omite from", () => {
    const params = paramsOf(invoiceExportHref(null, "2026-03-31", "csv"));
    expect(params.has("from")).toBe(false);
    expect(params.get("to")).toBe("2026-03-31");
  });

  it("sin periodo: solo viaja el formato (libro completo)", () => {
    const params = paramsOf(invoiceExportHref(null, null, "csv"));
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
    expect(params.get("format")).toBe("csv");
    // Un único parámetro presente: el formato.
    expect([...params.keys()]).toEqual(["format"]);
  });
});

describe("hasNonPeriodInvoiceFilters — solo cuentan los filtros NO fiscales", () => {
  it("es false sin filtros", () => {
    expect(hasNonPeriodInvoiceFilters(EMPTY_INVOICE_FILTERS)).toBe(false);
  });

  it("es false aunque haya rango de fechas (el periodo SÍ se exporta)", () => {
    const withPeriod: InvoiceFilters = {
      ...EMPTY_INVOICE_FILTERS,
      from: "2026-01-01",
      to: "2026-03-31",
    };
    expect(hasNonPeriodInvoiceFilters(withPeriod)).toBe(false);
  });

  it("es true con sede, tipo, método o búsqueda", () => {
    const cases: Partial<InvoiceFilters>[] = [
      { locationId: "11111111-1111-1111-1111-111111111111" },
      { invoiceType: "completa" },
      { paymentMethod: "tarjeta" },
      { search: "Nova SL" },
    ];
    for (const partial of cases) {
      expect(
        hasNonPeriodInvoiceFilters({ ...EMPTY_INVOICE_FILTERS, ...partial }),
      ).toBe(true);
    }
  });

  it("es true si se combinan periodo y un filtro no fiscal", () => {
    const mixed: InvoiceFilters = {
      ...EMPTY_INVOICE_FILTERS,
      from: "2026-01-01",
      to: "2026-03-31",
      paymentMethod: "efectivo",
    };
    expect(hasNonPeriodInvoiceFilters(mixed)).toBe(true);
  });
});
