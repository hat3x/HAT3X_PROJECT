/**
 * Capa de LECTURA de facturación (`@/lib/facturacion/queries`) — sub-15.
 *
 * `queries.ts` es el punto donde la vista de Facturación traduce los filtros a las
 * RPC de servidor y acota cada lectura por `salon_id`. Se ejercita contra un doble
 * MÍNIMO de Supabase (registra cada `.from(...).eq(...)` y cada `.rpc(name, args)`)
 * y con los normalizadores REALES de `@/lib/facturacion/rows`, de modo que se blindan
 * a la vez las cuatro invariantes de la subtarea sin necesidad de base de datos:
 *
 *   1. FILTROS: `fetchFilteredInvoices` / `fetchInvoiceTotals` traducen el rango, la
 *      sede, el tipo F1/F2, el método y la búsqueda a los argumentos `p_*` de la RPC.
 *   2. AGREGACIÓN QUE CUADRA: lista y totales consultan EXACTAMENTE el mismo conjunto
 *      (idénticos `p_*`, la lista solo añade `p_limit`), así que la fila de TOTALES del
 *      periodo cuadra con lo filtrado aunque la tabla muestre solo las N más recientes.
 *   3. AISLAMIENTO MULTI-TENANT: toda lectura se acota por `salon_id` / `p_salon_id`
 *      (defensa en profundidad sobre la RLS); el detalle de una venta se pide por
 *      salón + id y devuelve `null` si no pertenece (404 sin filtrar existencia).
 *   4. VACÍO: sin filas la lista es `[]` y los totales son `EMPTY_INVOICE_TOTALS`
 *      (todo a cero, sin NaN ni excepción); un error de PostgREST se traduce a Error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// Mock (hoisted) del ÚNICO efecto de servidor: el cliente Supabase. Los
// normalizadores de filas se usan REALES para verificar el mapeo de verdad.
const h = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: h.createClient }));

import { EMPTY_INVOICE_FILTERS, type InvoiceFilters } from "@/lib/facturacion/filters";
import { EMPTY_INVOICE_TOTALS } from "@/lib/facturacion/rows";
import {
  FACTURACION_LIST_LIMIT,
  fetchFilteredInvoices,
  fetchInvoiceTotals,
  fetchRecentInvoices,
  fetchRecentSales,
  fetchSaleDetail,
} from "@/lib/facturacion/queries";

// ─────────────────────────────────────────────────────────────────────────────
// Doble mínimo de Supabase.
//
//   · `.from(table).select(...).eq(col, val).order(...).limit(n)` — el builder es
//     THENABLE (se AWAITA la cadena, sin `.maybeSingle`) → resuelve `{ data, error }`
//     para `fetchRecentInvoices` / `fetchRecentSales`.
//   · `.from(...).eq(...).eq(...).maybeSingle()` — resuelve `{ data, error }` para
//     `fetchSaleDetail`.
//   · `.rpc(name, args)` — resuelve `{ data, error }` para las lecturas filtradas.
//
// Cada llamada se registra en `calls` para poder afirmar el acotado por salón y los
// argumentos que se pasan a la RPC.
// ─────────────────────────────────────────────────────────────────────────────
interface Programmed {
  data?: unknown;
  error?: { message: string } | null;
}

interface Recorded {
  from: string[];
  eq: Array<[string, unknown]>;
  orders: Array<[string, unknown]>;
  limit: number | undefined;
  rpc: Array<{ name: string; args: Record<string, unknown> }>;
}

function makeClient(programmed: Programmed = {}) {
  const calls: Recorded = { from: [], eq: [], orders: [], limit: undefined, rpc: [] };
  const result = {
    data: programmed.error != null ? null : (programmed.data ?? null),
    error: programmed.error ?? null,
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls.eq.push([col, val]);
      return builder;
    },
    order: (col: string, opts: unknown) => {
      calls.orders.push([col, opts]);
      return builder;
    },
    limit: (n: number) => {
      calls.limit = n;
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
    // Thenable: `await from(...).select(...).eq(...).order(...).limit(...)`.
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(resolve(result)),
  };

  const client = {
    from: (table: string) => {
      calls.from.push(table);
      return builder;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      return Promise.resolve(result);
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

/** Programa el cliente que devolverá `createClient()` y expone su registro de llamadas. */
function arrange(programmed: Programmed = {}): Recorded {
  const { client, calls } = makeClient(programmed);
  h.createClient.mockReturnValue(client);
  return calls;
}

const SALON_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SALON_B = "bbbbbbbb-0000-4000-8000-000000000002";
const LOC_A = "11111111-1111-1111-1111-111111111111";

/** Filtros «llenos» de ejemplo (uno de cada tipo) para las afirmaciones de mapeo. */
const FULL_FILTERS: InvoiceFilters = {
  from: "2026-07-01",
  to: "2026-07-23",
  locationId: LOC_A,
  invoiceType: "completa",
  paymentMethod: "tarjeta",
  search: "Nova SL",
};

/** Traducción canónica de esos filtros a los `p_*` de la RPC (sin `p_limit`). */
const FULL_ARGS = {
  p_salon_id: SALON_A,
  p_from: "2026-07-01",
  p_to: "2026-07-23",
  p_location_id: LOC_A,
  p_invoice_type: "completa",
  p_payment_method: "tarjeta",
  p_search: "Nova SL",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1) FILTROS — rango, sede, tipo F1/F2, método y búsqueda → argumentos de la RPC.
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchFilteredInvoices — los filtros viajan a la RPC (rango, sede, tipo, método, búsqueda)", () => {
  it("traduce todos los filtros a p_* y añade p_limit por defecto (100)", async () => {
    const calls = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, FULL_FILTERS);

    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0]?.name).toBe("salon_invoices_filtered");
    expect(calls.rpc[0]?.args).toEqual({ ...FULL_ARGS, p_limit: FACTURACION_LIST_LIMIT });
  });

  it("mapea el tipo F2 (ticket) sin tocar el resto de filtros", async () => {
    const calls = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, {
      ...EMPTY_INVOICE_FILTERS,
      invoiceType: "ticket",
    });
    expect(calls.rpc[0]?.args).toMatchObject({ p_invoice_type: "ticket" });
  });

  it("sin filtros activos envía todos los criterios a null pero SIEMPRE acota por salón", async () => {
    const calls = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS);
    expect(calls.rpc[0]?.args).toEqual({
      p_salon_id: SALON_A,
      p_from: null,
      p_to: null,
      p_location_id: null,
      p_invoice_type: null,
      p_payment_method: null,
      p_search: null,
      p_limit: FACTURACION_LIST_LIMIT,
    });
  });

  it("respeta un límite explícito (p. ej. el export pide más filas)", async () => {
    const calls = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS, 5000);
    expect(calls.rpc[0]?.args).toMatchObject({ p_limit: 5000 });
  });

  it("normaliza las filas crudas de la RPC con toInvoiceRow (completa → F1, receptor)", async () => {
    const rawInvoice = {
      id: "inv-1",
      full_number: "A-000123",
      invoice_type: "completa",
      issued_at: "2026-07-20T10:00:00.000Z",
      recipient_data: { tax_id: "B12345678", name: "Cliente SL" },
      taxable_base_cents: 10_000,
      tax_cents: 2_100,
      total_cents: 12_100,
      currency: "EUR",
    };
    arrange({ data: [rawInvoice] });
    const rows = await fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "inv-1",
      fullNumber: "A-000123",
      recipientName: "Cliente SL",
      totalCents: 12_100,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) TOTALES DEL PERIODO — mapeo y cuadre con lo filtrado.
// ─────────────────────────────────────────────────────────────────────────────
describe("fetchInvoiceTotals — nº de facturas y Σ base/IVA/total del periodo filtrado", () => {
  it("mapea la fila agregada de la RPC al modelo de la vista", async () => {
    arrange({
      data: [
        { invoice_count: 3, taxable_base_cents: 30_000, tax_cents: 6_300, total_cents: 36_300 },
      ],
    });
    await expect(fetchInvoiceTotals(SALON_A, FULL_FILTERS)).resolves.toEqual({
      invoiceCount: 3,
      taxableBaseCents: 30_000,
      taxCents: 6_300,
      totalCents: 36_300,
    });
  });

  it("consulta la RPC de totales con los MISMOS filtros que la lista (sin p_limit)", async () => {
    const calls = arrange({ data: [] });
    await fetchInvoiceTotals(SALON_A, FULL_FILTERS);
    expect(calls.rpc[0]?.name).toBe("salon_invoices_totals");
    expect(calls.rpc[0]?.args).toEqual(FULL_ARGS);
    expect(calls.rpc[0]?.args).not.toHaveProperty("p_limit");
  });
});

describe("cuadre lista ↔ totales — misma fuente de verdad del filtro", () => {
  it("los p_* de la lista (salvo p_limit) coinciden EXACTAMENTE con los de los totales", async () => {
    const listCalls = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, FULL_FILTERS);
    const totalsCalls = arrange({ data: [] });
    await fetchInvoiceTotals(SALON_A, FULL_FILTERS);

    const { p_limit, ...listArgsSinLimite } = listCalls.rpc[0]?.args as Record<string, unknown>;
    expect(p_limit).toBe(FACTURACION_LIST_LIMIT);
    expect(listArgsSinLimite).toEqual(totalsCalls.rpc[0]?.args);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) AISLAMIENTO MULTI-TENANT — toda lectura se acota por salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("aislamiento — cada lectura se acota por salon_id", () => {
  it("fetchRecentInvoices consulta pos_invoices acotado por salón, ordenado y con tope", async () => {
    const calls = arrange({ data: [] });
    await fetchRecentInvoices(SALON_A);
    expect(calls.from).toEqual(["pos_invoices"]);
    expect(calls.eq).toContainEqual(["salon_id", SALON_A]);
    expect(calls.orders.map((o) => o[0])).toEqual(["issued_at", "sequential_number"]);
    expect(calls.limit).toBe(FACTURACION_LIST_LIMIT);
  });

  it("fetchRecentSales consulta pos_sales acotado por salón", async () => {
    const calls = arrange({ data: [] });
    await fetchRecentSales(SALON_A);
    expect(calls.from).toEqual(["pos_sales"]);
    expect(calls.eq).toContainEqual(["salon_id", SALON_A]);
    expect(calls.limit).toBe(FACTURACION_LIST_LIMIT);
  });

  it("las RPC llevan el p_salon_id del salón que consulta (dos salones ⇒ dos ámbitos)", async () => {
    const callsA = arrange({ data: [] });
    await fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS);
    const callsB = arrange({ data: [] });
    await fetchInvoiceTotals(SALON_B, EMPTY_INVOICE_FILTERS);

    expect(callsA.rpc[0]?.args).toMatchObject({ p_salon_id: SALON_A });
    expect(callsB.rpc[0]?.args).toMatchObject({ p_salon_id: SALON_B });
  });

  it("fetchSaleDetail pide la venta por salón + id (no cruza de salón)", async () => {
    const calls = arrange({
      data: {
        id: "sale-1",
        sold_at: "2026-07-22T18:30:00.000Z",
        status: "completed",
        currency: "EUR",
        subtotal_cents: 10_000,
        discount_cents: 0,
        tax_cents: 2_100,
        total_cents: 12_100,
        notes: null,
        professional: null,
        customer: null,
        session: null,
        lines: [],
        payments: [],
      },
    });
    const detail = await fetchSaleDetail(SALON_A, "sale-1");
    expect(calls.from).toEqual(["pos_sales"]);
    expect(calls.eq).toContainEqual(["salon_id", SALON_A]);
    expect(calls.eq).toContainEqual(["id", "sale-1"]);
    expect(detail?.id).toBe("sale-1");
  });

  it("una venta que no pertenece al salón ⇒ null (404 sin filtrar existencia)", async () => {
    arrange({ data: null }); // maybeSingle no encuentra fila para (salón, id)
    await expect(fetchSaleDetail(SALON_A, "sale-de-otro-salon")).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) VACÍO Y ERRORES — sin filas todo cae a cero / lista vacía, sin NaN ni crash.
// ─────────────────────────────────────────────────────────────────────────────
describe("vacío — sin datos, listas vacías y totales a cero (sin NaN ni excepción)", () => {
  it("fetchFilteredInvoices con data null ⇒ []", async () => {
    arrange({ data: null });
    await expect(fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS)).resolves.toEqual([]);
  });

  it("fetchRecentInvoices y fetchRecentSales con data null ⇒ []", async () => {
    arrange({ data: null });
    await expect(fetchRecentInvoices(SALON_A)).resolves.toEqual([]);
    arrange({ data: null });
    await expect(fetchRecentSales(SALON_A)).resolves.toEqual([]);
  });

  it("fetchInvoiceTotals sin filas ⇒ EMPTY_INVOICE_TOTALS (todo a cero)", async () => {
    arrange({ data: [] });
    const totals = await fetchInvoiceTotals(SALON_A, EMPTY_INVOICE_FILTERS);
    expect(totals).toEqual(EMPTY_INVOICE_TOTALS);
    expect(Object.values(totals).every((v) => v === 0)).toBe(true);
    expect(Object.values(totals).some((v) => Number.isNaN(v))).toBe(false);
  });
});

describe("errores — un fallo de PostgREST se traduce a Error (no se enmascara)", () => {
  it("fetchFilteredInvoices relanza con mensaje de dominio", async () => {
    arrange({ error: { message: "db down" } });
    await expect(fetchFilteredInvoices(SALON_A, EMPTY_INVOICE_FILTERS)).rejects.toThrow(
      /No se pudieron cargar las facturas/,
    );
  });

  it("fetchInvoiceTotals relanza con mensaje de dominio", async () => {
    arrange({ error: { message: "db down" } });
    await expect(fetchInvoiceTotals(SALON_A, EMPTY_INVOICE_FILTERS)).rejects.toThrow(
      /No se pudieron calcular los totales/,
    );
  });

  it("fetchSaleDetail relanza si la consulta falla", async () => {
    arrange({ error: { message: "db down" } });
    await expect(fetchSaleDetail(SALON_A, "sale-1")).rejects.toThrow(
      /No se pudo cargar la venta/,
    );
  });
});
