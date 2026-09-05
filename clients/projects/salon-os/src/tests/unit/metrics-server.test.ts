/**
 * Comportamiento de los envoltorios TS de la capa de métricas
 * (`@/lib/metrics/server`) contra un doble de Supabase que registra cada
 * `.rpc(name, args)`. Verifica el CONTRATO de la capa TS sin necesidad de base:
 *
 *   · Cada helper llama a la RPC correcta con los parámetros `p_*` esperados
 *     (nombre, salon_id, rango, y opcionales como granularidad / limit / kind /
 *     location).
 *   · Los helpers de UNA fila (summary, nuevos-vs-recurrentes, ocupación)
 *     resuelven el primer elemento, y caen a su valor a CERO cuando la RPC no
 *     devuelve filas.
 *   · Los helpers de conjunto devuelven `[]` ante `data: null`.
 *   · Un `error` de PostgREST se propaga (lo traduce el llamador).
 */
import { describe, it, expect, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import {
  EMPTY_NEW_VS_RETURNING,
  EMPTY_OCCUPANCY,
  EMPTY_SALES_SUMMARY,
  getAgendaOccupancy,
  getNewVsReturningCustomers,
  getPaymentMethodDistribution,
  getRevenueByLocation,
  getRevenueByProfessional,
  getRevenueTimeseries,
  getSalesSummary,
  getTopItems,
  getTopProducts,
  getTopServices,
} from "@/lib/metrics";

const SALON = "11111111-1111-1111-1111-111111111111";
const PERIOD = { from: "2026-07-01", to: "2026-07-31" };

/** Doble mínimo: `.rpc()` devuelve lo programado y registra (name, args). */
function makeClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("métricas TS — cada helper llama a su RPC con los parámetros correctos", () => {
  it("getSalesSummary → salon_sales_summary(p_salon_id, p_from, p_to)", async () => {
    const { client, rpc } = makeClient({
      data: [
        { ...EMPTY_SALES_SUMMARY, sales_count: 3, gross_revenue_cents: 12300 },
      ],
    });
    const out = await getSalesSummary(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_sales_summary", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
    });
    expect(out.sales_count).toBe(3);
    expect(out.gross_revenue_cents).toBe(12300);
  });

  it("getRevenueTimeseries pasa la granularidad (por defecto 'day')", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getRevenueTimeseries(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_revenue_timeseries", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_granularity: "day",
    });
    await getRevenueTimeseries(client, SALON, PERIOD, "month");
    expect(rpc).toHaveBeenLastCalledWith("salon_revenue_timeseries", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_granularity: "month",
    });
  });

  it("getRevenueByLocation → salon_revenue_by_location", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getRevenueByLocation(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_revenue_by_location", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
    });
  });

  it("getRevenueByProfessional pasa el límite del ranking (por defecto 20)", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getRevenueByProfessional(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_revenue_by_professional", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_limit: 20,
    });
    await getRevenueByProfessional(client, SALON, PERIOD, 5);
    expect(rpc).toHaveBeenLastCalledWith("salon_revenue_by_professional", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_limit: 5,
    });
  });

  it("getTopServices / getTopProducts fijan p_item_kind", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getTopServices(client, SALON, PERIOD);
    expect(rpc).toHaveBeenLastCalledWith("salon_top_items", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_item_kind: "service",
      p_limit: 10,
    });
    await getTopProducts(client, SALON, PERIOD, 3);
    expect(rpc).toHaveBeenLastCalledWith("salon_top_items", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_item_kind: "product",
      p_limit: 3,
    });
  });

  it("getTopItems sin kind envía p_item_kind = null (servicios + productos)", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getTopItems(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_top_items", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_item_kind: null,
      p_limit: 10,
    });
  });

  it("getPaymentMethodDistribution → salon_payment_method_distribution", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getPaymentMethodDistribution(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_payment_method_distribution", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
    });
  });

  it("getAgendaOccupancy pasa p_location_id (por defecto null)", async () => {
    const { client, rpc } = makeClient({ data: [] });
    await getAgendaOccupancy(client, SALON, PERIOD);
    expect(rpc).toHaveBeenCalledWith("salon_agenda_occupancy", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_location_id: null,
    });
    await getAgendaOccupancy(client, SALON, PERIOD, "sede-1");
    expect(rpc).toHaveBeenLastCalledWith("salon_agenda_occupancy", {
      p_salon_id: SALON,
      p_from: "2026-07-01",
      p_to: "2026-07-31",
      p_location_id: "sede-1",
    });
  });
});

describe("métricas TS — resultados vacíos caen a cero / lista vacía", () => {
  it("summary sin filas → EMPTY_SALES_SUMMARY", async () => {
    const { client } = makeClient({ data: null });
    expect(await getSalesSummary(client, SALON, PERIOD)).toEqual(
      EMPTY_SALES_SUMMARY,
    );
  });

  it("nuevos-vs-recurrentes sin filas → EMPTY_NEW_VS_RETURNING", async () => {
    const { client } = makeClient({ data: [] });
    expect(await getNewVsReturningCustomers(client, SALON, PERIOD)).toEqual(
      EMPTY_NEW_VS_RETURNING,
    );
  });

  it("ocupación sin filas → EMPTY_OCCUPANCY", async () => {
    const { client } = makeClient({ data: null });
    expect(await getAgendaOccupancy(client, SALON, PERIOD)).toEqual(
      EMPTY_OCCUPANCY,
    );
  });

  it("helpers de conjunto con data null → []", async () => {
    const { client } = makeClient({ data: null });
    expect(await getRevenueByLocation(client, SALON, PERIOD)).toEqual([]);
    expect(await getRevenueTimeseries(client, SALON, PERIOD)).toEqual([]);
    expect(await getPaymentMethodDistribution(client, SALON, PERIOD)).toEqual(
      [],
    );
  });
});

describe("métricas TS — un error de PostgREST se propaga", () => {
  it("getSalesSummary relanza el error", async () => {
    const boom = new Error("db down");
    const { client } = makeClient({ error: boom });
    await expect(getSalesSummary(client, SALON, PERIOD)).rejects.toBe(boom);
  });

  it("getRevenueByProfessional relanza el error", async () => {
    const boom = new Error("db down");
    const { client } = makeClient({ error: boom });
    await expect(getRevenueByProfessional(client, SALON, PERIOD)).rejects.toBe(
      boom,
    );
  });
});
