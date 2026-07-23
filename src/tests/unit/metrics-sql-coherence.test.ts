/**
 * Coherencia CONTRATO ↔ SQL de la capa de agregación de métricas
 * (`supabase/migrations/20260723100000_rpc_dashboard_metrics.sql`).
 *
 * No hay Postgres en el harness de tests, así que —igual que
 * `normalize-phone-sql-coherence` (sección C)— se blindan por LECTURA de la
 * migración real los invariantes que la tarea exige y de los que dependen tanto
 * el aislamiento multi-tenant como la corrección de las cifras:
 *
 *   1. Existen las 8 RPC del brief (una por métrica) + el helper de rango.
 *   2. Cada RPC pública agrega en servidor (`group by`; la serie temporal, además,
 *      con `date_trunc`) — NUNCA devuelve filas crudas.
 *   3. Aislamiento "acotado por salon_id CON RLS": SECURITY INVOKER (no definer),
 *      `search_path=''` y filtro `salon_id = p_salon_id` en cada función.
 *   4. Permisos: REVOKE a public + GRANT execute a authenticated (nunca anon).
 *   5. Dinero en céntimos: las sumas se castean a `bigint` (no float).
 *   6. Facturación = ventas `completed`.
 *
 * Si una migración futura degradara cualquiera de estos puntos (p. ej. cambiar a
 * SECURITY DEFINER sin gate, o devolver filas sin agrupar), el test falla ruidoso.
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

/** Las 8 funciones públicas del brief (nombre → concepto). */
const PUBLIC_FUNCTIONS = [
  "salon_sales_summary",
  "salon_revenue_timeseries",
  "salon_revenue_by_location",
  "salon_revenue_by_professional",
  "salon_top_items",
  "salon_payment_method_distribution",
  "salon_new_vs_returning_customers",
  "salon_agenda_occupancy",
] as const;

/** Funciones cuya facturación se restringe a ventas completed. */
const COMPLETED_ONLY = PUBLIC_FUNCTIONS.filter(
  (n) => n !== "salon_agenda_occupancy",
);

/**
 * Aísla el cuerpo de una función `create or replace function public.<name>(` hasta
 * su cierre `$$;`, para comprobar anclajes SOBRE la definición y no sobre el
 * encabezado / otras funciones.
 */
function fnBody(name: string): string {
  const start = MIGRATION.indexOf(
    `create or replace function public.${name}(`,
  );
  expect(start, `falta la función public.${name}`).toBeGreaterThan(-1);
  const end = MIGRATION.indexOf("$$;", start);
  expect(end, `función public.${name} sin cierre $$;`).toBeGreaterThan(start);
  return MIGRATION.slice(start, end);
}

describe("métricas SQL — existencia de las 8 RPC + helper de rango", () => {
  it("define el helper interno app.salon_period_bounds (zona horaria del salón)", () => {
    expect(MIGRATION).toContain(
      "create or replace function app.salon_period_bounds(",
    );
    // Rango semiabierto en la zona del salón: p_to inclusivo (día siguiente).
    expect(MIGRATION).toContain("at time zone");
    expect(MIGRATION).toContain("(p_to + 1)");
  });

  it.each(PUBLIC_FUNCTIONS)("define public.%s", (name) => {
    expect(MIGRATION).toContain(`create or replace function public.${name}(`);
  });
});

describe("métricas SQL — agregación en servidor (no filas crudas)", () => {
  it.each(PUBLIC_FUNCTIONS)(
    "%s agrupa con GROUP BY o es un agregado único",
    (name) => {
      const body = fnBody(name);
      // O agrupa explícitamente (rankings/series/distribución) o es un agregado
      // escalar de una sola fila (summary/occupancy/new-vs-returning usan count/
      // sum sin group by). En ambos casos NO se devuelven filas por venta.
      const aggregates = /\b(group by|count\(|sum\()/i.test(body);
      expect(aggregates, `${name} no agrega en servidor`).toBe(true);
    },
  );

  it("la serie temporal usa date_trunc (facturación EN EL TIEMPO)", () => {
    const body = fnBody("salon_revenue_timeseries");
    expect(body).toContain("date_trunc(");
    expect(body).toContain("group by");
    // Granularidad acotada a un conjunto seguro (no inyecta cualquier campo).
    expect(body).toMatch(/'day'.*'week'.*'month'.*'year'/s);
  });

  it("ranking por profesional y top items ordenan y acotan (limit)", () => {
    expect(fnBody("salon_revenue_by_professional")).toMatch(
      /order by[\s\S]*limit/i,
    );
    expect(fnBody("salon_top_items")).toMatch(/order by[\s\S]*limit/i);
  });
});

describe("métricas SQL — aislamiento multi-tenant (salon_id CON RLS)", () => {
  it.each(PUBLIC_FUNCTIONS)("%s es SECURITY INVOKER (no definer)", (name) => {
    const body = fnBody(name).toLowerCase();
    expect(body).toContain("security invoker");
    expect(body, `${name} NO debe ser security definer`).not.toContain(
      "security definer",
    );
  });

  it.each(PUBLIC_FUNCTIONS)("%s fija search_path='' (anti-inyección)", (name) => {
    expect(fnBody(name)).toContain("set search_path = ''");
  });

  it.each(PUBLIC_FUNCTIONS)("%s acota por salon_id = p_salon_id", (name) => {
    expect(fnBody(name)).toContain("salon_id = p_salon_id");
  });
});

describe("métricas SQL — permisos (authenticated, nunca anon/public)", () => {
  it.each(PUBLIC_FUNCTIONS)(
    "%s: REVOKE public + GRANT execute authenticated",
    (name) => {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke all on function public\\.${name}\\b[\\s\\S]*?from public`,
        ),
      );
      expect(MIGRATION).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}\\b[\\s\\S]*?to authenticated`,
        ),
      );
    },
  );

  it("ninguna función se concede a anon", () => {
    // El GRANT es a `authenticated, service_role`; jamás a `anon`.
    expect(MIGRATION).not.toMatch(/to\s+anon\b/);
  });
});

describe("métricas SQL — dinero en céntimos y facturación completed", () => {
  it("las sumas de importes se castean a bigint (enteros de céntimos, no float)", () => {
    // sum(total_cents) → bigint: miles de ventas no desbordan y no hay float.
    expect(MIGRATION).toMatch(/sum\(s\.total_cents\), 0\)::bigint/);
    expect(MIGRATION).toMatch(/sum\(pm\.amount_cents\), 0\)::bigint/);
    expect(MIGRATION).toMatch(/sum\(l\.line_total_cents\), 0\)::bigint/);
    // No debe aparecer aritmética con float sobre importes.
    expect(MIGRATION).not.toMatch(/::float/);
  });

  it.each(COMPLETED_ONLY)(
    "%s cuenta solo ventas status = 'completed'",
    (name) => {
      expect(fnBody(name), `${name} no filtra completed`).toMatch(
        /status\s*=\s*'completed'/,
      );
    },
  );

  it("la ocupación excluye citas canceladas y divide reservado/capacidad", () => {
    const body = fnBody("salon_agenda_occupancy");
    expect(body).toMatch(/status\s*<>\s*'cancelled'/);
    expect(body).toContain(
      "booked.minutes::numeric / capacity.minutes::numeric",
    );
    // Convención de weekday 0=domingo … 6=sábado (== extract(dow)).
    expect(body).toContain("extract(dow from d.d)");
  });
});
