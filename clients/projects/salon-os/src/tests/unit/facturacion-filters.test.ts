/**
 * Parseo PURO de los filtros del libro de facturas (`@/lib/facturacion/filters`) —
 * sub-6.
 *
 * Blinda que la URL → `InvoiceFilters` sea ROBUSTA (nunca lanza; lo inválido cae a
 * «sin filtro») y COHERENTE con la RPC de servidor:
 *   · fechas ISO válidas; rango imposible (desde > hasta) se descarta entero;
 *   · sede validada contra las sedes reales del salón;
 *   · tipo f1/f2 ↔ enum completa/ticket; método dentro del enum; búsqueda recortada;
 *   · ida y vuelta filtros → query params → filtros (solo parámetros activos).
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_INVOICE_FILTERS,
  hasActiveInvoiceFilters,
  INVOICE_TYPE_FILTER_OPTIONS,
  invoiceFiltersToSearchParams,
  invoiceTypeToParam,
  parseInvoiceFilters,
  PAYMENT_METHOD_FILTER_OPTIONS,
  type InvoiceFilters,
  type RawSearchParams,
} from "@/lib/facturacion/filters";

const LOC_A = "11111111-1111-1111-1111-111111111111";
const LOC_B = "22222222-2222-2222-2222-222222222222";
const VALID_LOCATIONS = [LOC_A, LOC_B];

describe("parseInvoiceFilters — vacío y por defecto", () => {
  it("sin parámetros devuelve filtros vacíos (sin criterios)", () => {
    expect(parseInvoiceFilters({}, VALID_LOCATIONS)).toEqual(EMPTY_INVOICE_FILTERS);
  });

  it("parámetros desconocidos se ignoran", () => {
    const params: RawSearchParams = { foo: "bar", pagina: "3" };
    expect(parseInvoiceFilters(params, VALID_LOCATIONS)).toEqual(EMPTY_INVOICE_FILTERS);
  });
});

describe("parseInvoiceFilters — rango de fechas", () => {
  it("acepta desde/hasta ISO válidas (rango cerrado)", () => {
    const params: RawSearchParams = { desde: "2026-07-01", hasta: "2026-07-23" };
    const filters = parseInvoiceFilters(params, VALID_LOCATIONS);
    expect(filters.from).toBe("2026-07-01");
    expect(filters.to).toBe("2026-07-23");
  });

  it("admite extremos independientes (solo desde, solo hasta)", () => {
    expect(parseInvoiceFilters({ desde: "2026-07-01" }, VALID_LOCATIONS).from).toBe(
      "2026-07-01",
    );
    expect(parseInvoiceFilters({ desde: "2026-07-01" }, VALID_LOCATIONS).to).toBeNull();
    expect(parseInvoiceFilters({ hasta: "2026-07-23" }, VALID_LOCATIONS).to).toBe(
      "2026-07-23",
    );
  });

  it("descarta fechas no ISO o inexistentes de calendario", () => {
    expect(parseInvoiceFilters({ desde: "ayer" }, VALID_LOCATIONS).from).toBeNull();
    expect(parseInvoiceFilters({ hasta: "2026-02-31" }, VALID_LOCATIONS).to).toBeNull();
    expect(parseInvoiceFilters({ desde: "2026-7-1" }, VALID_LOCATIONS).from).toBeNull();
  });

  it("rango imposible (desde > hasta) se descarta ENTERO (defensivo)", () => {
    const params: RawSearchParams = { desde: "2026-07-30", hasta: "2026-07-01" };
    const filters = parseInvoiceFilters(params, VALID_LOCATIONS);
    expect(filters.from).toBeNull();
    expect(filters.to).toBeNull();
  });

  it("desde == hasta es válido (un solo día)", () => {
    const filters = parseInvoiceFilters(
      { desde: "2026-07-10", hasta: "2026-07-10" },
      VALID_LOCATIONS,
    );
    expect(filters.from).toBe("2026-07-10");
    expect(filters.to).toBe("2026-07-10");
  });
});

describe("parseInvoiceFilters — sede", () => {
  it("acepta una sede que existe en el salón", () => {
    expect(parseInvoiceFilters({ sede: LOC_A }, VALID_LOCATIONS).locationId).toBe(LOC_A);
  });

  it("descarta una sede desconocida (defensa en profundidad)", () => {
    expect(
      parseInvoiceFilters({ sede: "99999999-9999-9999-9999-999999999999" }, VALID_LOCATIONS)
        .locationId,
    ).toBeNull();
  });

  it("sin lista de sedes válidas, cualquier sede se descarta", () => {
    expect(parseInvoiceFilters({ sede: LOC_A }, []).locationId).toBeNull();
  });
});

describe("parseInvoiceFilters — tipo F1/F2", () => {
  it("mapea f1 → completa y f2 → ticket (insensible a mayúsculas)", () => {
    expect(parseInvoiceFilters({ tipo: "f1" }, VALID_LOCATIONS).invoiceType).toBe(
      "completa",
    );
    expect(parseInvoiceFilters({ tipo: "F2" }, VALID_LOCATIONS).invoiceType).toBe(
      "ticket",
    );
  });

  it("descarta un tipo desconocido", () => {
    expect(parseInvoiceFilters({ tipo: "f3" }, VALID_LOCATIONS).invoiceType).toBeNull();
  });
});

describe("parseInvoiceFilters — método de pago", () => {
  it("acepta un método del enum", () => {
    expect(parseInvoiceFilters({ metodo: "tarjeta" }, VALID_LOCATIONS).paymentMethod).toBe(
      "tarjeta",
    );
  });

  it("descarta un método fuera del enum", () => {
    expect(
      parseInvoiceFilters({ metodo: "cheque" }, VALID_LOCATIONS).paymentMethod,
    ).toBeNull();
  });
});

describe("parseInvoiceFilters — búsqueda", () => {
  it("recorta la búsqueda y descarta la que queda en blanco", () => {
    expect(parseInvoiceFilters({ q: "  A-000123 " }, VALID_LOCATIONS).search).toBe(
      "A-000123",
    );
    expect(parseInvoiceFilters({ q: "   " }, VALID_LOCATIONS).search).toBeNull();
  });
});

describe("parseInvoiceFilters — parámetro como lista (Next puede dar string[])", () => {
  it("toma el primer valor de un parámetro repetido", () => {
    const params: RawSearchParams = { tipo: ["f1", "f2"], q: ["hola", "adios"] };
    const filters = parseInvoiceFilters(params, VALID_LOCATIONS);
    expect(filters.invoiceType).toBe("completa");
    expect(filters.search).toBe("hola");
  });
});

describe("hasActiveInvoiceFilters", () => {
  it("es false con filtros vacíos y true en cuanto hay un criterio", () => {
    expect(hasActiveInvoiceFilters(EMPTY_INVOICE_FILTERS)).toBe(false);
    const withType: InvoiceFilters = { ...EMPTY_INVOICE_FILTERS, invoiceType: "ticket" };
    expect(hasActiveInvoiceFilters(withType)).toBe(true);
    const withSearch: InvoiceFilters = { ...EMPTY_INVOICE_FILTERS, search: "x" };
    expect(hasActiveInvoiceFilters(withSearch)).toBe(true);
  });
});

describe("invoiceFiltersToSearchParams — ida y vuelta", () => {
  it("serializa solo los parámetros activos", () => {
    const filters: InvoiceFilters = {
      from: "2026-07-01",
      to: "2026-07-23",
      locationId: LOC_B,
      invoiceType: "completa",
      paymentMethod: "bizum",
      search: "Nova SL",
    };
    const params = invoiceFiltersToSearchParams(filters);
    expect(params.get("desde")).toBe("2026-07-01");
    expect(params.get("hasta")).toBe("2026-07-23");
    expect(params.get("sede")).toBe(LOC_B);
    expect(params.get("tipo")).toBe("f1");
    expect(params.get("metodo")).toBe("bizum");
    expect(params.get("q")).toBe("Nova SL");
  });

  it("omite por completo los criterios inactivos", () => {
    const params = invoiceFiltersToSearchParams(EMPTY_INVOICE_FILTERS);
    expect(params.toString()).toBe("");
  });

  it("round-trip: serializar y volver a parsear conserva los filtros", () => {
    const filters: InvoiceFilters = {
      from: "2026-01-01",
      to: "2026-12-31",
      locationId: LOC_A,
      invoiceType: "ticket",
      paymentMethod: "efectivo",
      search: "cliente",
    };
    const params = invoiceFiltersToSearchParams(filters);
    const roundTripped = parseInvoiceFilters(
      Object.fromEntries(params.entries()),
      VALID_LOCATIONS,
    );
    expect(roundTripped).toEqual(filters);
  });
});

describe("opciones y mapeos de tipo", () => {
  it("expone F1 y F2 como opciones de tipo", () => {
    expect(INVOICE_TYPE_FILTER_OPTIONS.map((o) => o.value)).toEqual(["f1", "f2"]);
  });

  it("expone los cinco métodos base del enum", () => {
    expect(PAYMENT_METHOD_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "efectivo",
      "tarjeta",
      "bizum",
      "transferencia",
      "otro",
    ]);
  });

  it("invoiceTypeToParam es la inversa del mapeo de parseo", () => {
    expect(invoiceTypeToParam("completa")).toBe("f1");
    expect(invoiceTypeToParam("ticket")).toBe("f2");
  });
});
