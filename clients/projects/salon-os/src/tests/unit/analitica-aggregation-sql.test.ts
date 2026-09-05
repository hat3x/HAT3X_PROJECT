/**
 * Corrección de las CIFRAS de la analítica — coherencia contrato ↔ SQL de la capa de
 * agregación (`supabase/migrations/20260723100000_rpc_dashboard_metrics.sql`) — sub-15.
 *
 * `metrics-sql-coherence` ya blinda la SEGURIDAD y la EXISTENCIA de las RPC (SECURITY
 * INVOKER, `search_path=''`, permisos, «hay group by»). Este archivo es la otra cara:
 * fija que los NÚMEROS que ve el salón son correctos, que es lo que pide la subtarea.
 * Sin Postgres en el harness, se ancla por LECTURA del cuerpo de cada función:
 *
 *   1. TICKET MEDIO = total / nº: `round(Σ total_cents / count(*))` en el KPI y en la
 *      serie temporal — nunca a mano ni con float.
 *   2. VACÍO SIN NaN: el KPI guarda la división con `case when count(*) > 0 … else 0`,
 *      de modo que un periodo sin ventas da ticket medio 0 (no una división por cero).
 *   3. SUMA QUE CUADRA: la facturación es `Σ total_cents`, con base (`Σ subtotal_cents`)
 *      e IVA (`Σ tax_cents`) por separado; la distribución por método suma los cobros
 *      de las MISMAS ventas completed (cuadra con la facturación).
 *   4. AGRUPACIÓN CORRECTA: por sede (`group by loc.id`), por profesional
 *      (`group by pro.id`) y por método (`group by pm.method`), con la sede resuelta
 *      por venta → sesión → location y el profesional por `pos_sales.professional_id`.
 *
 * Si una migración futura recomputara el ticket medio a mano, quitara el guardián de la
 * división o cambiara la clave de agrupación, el test lo delata.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260723100000_rpc_dashboard_metrics.sql",
  ),
  "utf8",
);

/** Aísla el cuerpo de `create or replace function public.<name>(` hasta su `$$;`. */
function fnBody(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  expect(start, `falta la función public.${name}`).toBeGreaterThan(-1);
  const end = MIGRATION.indexOf("$$;", start);
  expect(end, `función public.${name} sin cierre $$;`).toBeGreaterThan(start);
  return MIGRATION.slice(start, end);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Ticket medio = total / nº (entero de céntimos, redondeado, sin float).
// ─────────────────────────────────────────────────────────────────────────────
describe("ticket medio — total / nº de tickets (redondeado a céntimos)", () => {
  it("el KPI calcula avg = round(Σ total_cents / count(*))", () => {
    const body = fnBody("salon_sales_summary");
    expect(body).toContain(
      "round(coalesce(sum(s.total_cents), 0)::numeric / count(*))::bigint",
    );
  });

  it("la serie temporal calcula el ticket medio del bucket con la misma fórmula", () => {
    const body = fnBody("salon_revenue_timeseries");
    expect(body).toContain(
      "round(coalesce(sum(s.total_cents), 0)::numeric / count(*))::bigint",
    );
  });

  it("el ticket medio se divide en numeric y se castea a bigint (nunca ::float)", () => {
    // El divisor va en numeric para no perder céntimos; el resultado, entero.
    expect(fnBody("salon_sales_summary")).toMatch(/::numeric \/ count\(\*\)\)::bigint/);
    expect(MIGRATION).not.toMatch(/::float/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Vacío sin NaN — el KPI guarda la división por cero (periodo sin ventas → 0).
// ─────────────────────────────────────────────────────────────────────────────
describe("periodo vacío — ticket medio 0, sin división por cero ni NaN", () => {
  it("el KPI protege la división: case when count(*) > 0 … else 0", () => {
    const body = fnBody("salon_sales_summary").toLowerCase();
    // Con 0 ventas el ramo `else 0` evita `x / 0`; el KPI cae a cero, no a NaN.
    expect(body).toMatch(/case\s+when\s+count\(\*\)\s*>\s*0/);
    expect(body).toMatch(/else\s+0\s+end/);
  });

  it("las sumas usan coalesce(…, 0): un periodo sin ventas suma 0, no NULL", () => {
    const body = fnBody("salon_sales_summary");
    expect(body).toContain("coalesce(sum(s.total_cents), 0)::bigint");
    expect(body).toContain("coalesce(sum(s.subtotal_cents), 0)::bigint");
    expect(body).toContain("coalesce(sum(s.tax_cents), 0)::bigint");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Suma que cuadra — facturación = Σ total; base e IVA por separado; cobros por
//    método sobre las MISMAS ventas completed.
// ─────────────────────────────────────────────────────────────────────────────
describe("facturación del periodo — Σ total, con base e IVA desglosados", () => {
  it("la facturación bruta es Σ total_cents (IVA incluido)", () => {
    expect(fnBody("salon_sales_summary")).toContain(
      "coalesce(sum(s.total_cents), 0)::bigint",
    );
  });

  it("solo cuenta ventas completed (no borradores ni anuladas descuadran la cifra)", () => {
    expect(fnBody("salon_sales_summary")).toMatch(/status\s*=\s*'completed'/);
  });

  it("la distribución por método suma los cobros de las ventas completed (cuadra con facturación)", () => {
    const body = fnBody("salon_payment_method_distribution");
    // Se une pos_payments con la VENTA y se filtra por su status/fecha, no por el cobro:
    // así un pago mixto son varias filas que suman el total del ticket.
    expect(body).toContain("from public.pos_payments pm");
    expect(body).toMatch(/join public\.pos_sales s/);
    expect(body).toMatch(/s\.status\s*=\s*'completed'/);
    expect(body).toContain("coalesce(sum(pm.amount_cents), 0)::bigint");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Agrupación correcta — por sede, por profesional y por método.
// ─────────────────────────────────────────────────────────────────────────────
describe("agrupación por SEDE — clave y resolución venta → sesión → location", () => {
  const body = () => fnBody("salon_revenue_by_location");

  it("agrupa por la sede (group by loc.id, loc.name)", () => {
    expect(body()).toMatch(/group by loc\.id, loc\.name/);
  });

  it("ata la venta a la sede por su sesión de caja (pos_sessions.location_id)", () => {
    const b = body();
    expect(b).toMatch(/join public\.pos_sessions sess\s+on sess\.id = s\.session_id/);
    expect(b).toMatch(/join public\.locations loc\s+on loc\.id = sess\.location_id/);
  });

  it("las ventas sin sede caen en una fila 'Sin sede' (no se pierden del reparto)", () => {
    expect(body()).toContain("coalesce(loc.name, 'Sin sede')");
  });
});

describe("agrupación por PROFESIONAL — ranking por pos_sales.professional_id", () => {
  const body = () => fnBody("salon_revenue_by_professional");

  it("agrupa por el profesional (group by pro.id, pro.full_name)", () => {
    expect(body()).toMatch(/group by pro\.id, pro\.full_name/);
  });

  it("atribuye por pos_sales.professional_id y ordena el ranking por facturación desc", () => {
    const b = body();
    expect(b).toMatch(/join public\.professionals pro\s+on pro\.id = s\.professional_id/);
    expect(b).toMatch(/order by 4 desc/); // 4 = revenue_cents
  });

  it("las ventas sin profesional caen en 'Sin profesional'", () => {
    expect(body()).toContain("coalesce(pro.full_name, 'Sin profesional')");
  });
});

describe("agrupación por MÉTODO de pago — group by pm.method", () => {
  const body = () => fnBody("salon_payment_method_distribution");

  it("agrupa por el método del enum (group by pm.method)", () => {
    expect(body()).toMatch(/group by pm\.method/);
  });

  it("devuelve el método como texto del enum y su Σ de importe", () => {
    const b = body();
    expect(b).toContain("pm.method::text");
    expect(b).toContain("coalesce(sum(pm.amount_cents), 0)::bigint");
  });
});
