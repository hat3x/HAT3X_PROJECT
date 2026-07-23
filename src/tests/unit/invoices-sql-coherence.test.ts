/**
 * Coherencia CONTRATO ↔ SQL de los filtros de facturación
 * (`supabase/migrations/20260723110000_rpc_invoices_filtered.sql`) — sub-6.
 *
 * No hay Postgres en el harness, así que —igual que `metrics-sql-coherence`— se
 * blindan por LECTURA de la migración real los invariantes de los que dependen la
 * corrección de las cifras y el aislamiento multi-tenant:
 *
 *   1. Existen el helper interno + las 2 funciones públicas (lista y totales).
 *   2. UNA sola fuente de verdad del filtro: ambas públicas se apoyan en
 *      `app.salon_filtered_invoices` (lista + totales SIEMPRE cuadran).
 *   3. El método de pago se filtra con EXISTS (no un JOIN que duplicaría la factura
 *      e inflaría las sumas).
 *   4. Aislamiento: SECURITY INVOKER (no definer), `search_path=''`, filtro
 *      `salon_id = p_salon_id` en el helper.
 *   5. Permisos: REVOKE public + GRANT execute authenticated; nunca anon.
 *   6. Dinero en céntimos: las sumas de totales se castean a `bigint` (no float).
 *   7. Rango por zona del salón con `p_to` inclusivo (día siguiente) y extremos
 *      opcionales (NULL = sin límite).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260723110000_rpc_invoices_filtered.sql",
  ),
  "utf8",
);

/** Las 2 funciones públicas del brief. */
const PUBLIC_FUNCTIONS = [
  "salon_invoices_filtered",
  "salon_invoices_totals",
] as const;

/** Aísla el cuerpo de una función hasta su cierre `$$;`. */
function fnBody(qualified: string, name: string): string {
  const start = MIGRATION.indexOf(
    `create or replace function ${qualified}.${name}(`,
  );
  expect(start, `falta la función ${qualified}.${name}`).toBeGreaterThan(-1);
  const end = MIGRATION.indexOf("$$;", start);
  expect(end, `función ${qualified}.${name} sin cierre $$;`).toBeGreaterThan(start);
  return MIGRATION.slice(start, end);
}

describe("facturas SQL — existencia (helper + 2 públicas)", () => {
  it("define el helper interno app.salon_filtered_invoices", () => {
    expect(MIGRATION).toContain(
      "create or replace function app.salon_filtered_invoices(",
    );
  });

  it.each(PUBLIC_FUNCTIONS)("define public.%s", (name) => {
    expect(MIGRATION).toContain(`create or replace function public.${name}(`);
  });
});

describe("facturas SQL — una sola fuente de verdad del filtro", () => {
  it.each(PUBLIC_FUNCTIONS)(
    "%s se apoya en el helper app.salon_filtered_invoices",
    (name) => {
      expect(fnBody("public", name)).toContain("app.salon_filtered_invoices(");
    },
  );

  it("la lista ordena por fecha/nº correlativo desc y acota con limit", () => {
    const body = fnBody("public", "salon_invoices_filtered");
    expect(body).toMatch(/order by[\s\S]*issued_at desc[\s\S]*sequential_number desc/i);
    expect(body).toMatch(/limit[\s\S]*p_limit/i);
  });

  it("los totales agregan count + sumas (una fila)", () => {
    const body = fnBody("public", "salon_invoices_totals");
    expect(body).toMatch(/count\(\*\)/);
    expect(body).toMatch(/sum\(f\.taxable_base_cents\)/);
    expect(body).toMatch(/sum\(f\.tax_cents\)/);
    expect(body).toMatch(/sum\(f\.total_cents\)/);
  });
});

describe("facturas SQL — filtros que cruzan tablas (sin descuadrar sumas)", () => {
  const helper = () => fnBody("app", "salon_filtered_invoices");

  it("el método de pago se filtra con EXISTS (no un JOIN que duplique la factura)", () => {
    const body = helper();
    expect(body).toMatch(/p_payment_method is null[\s\S]*exists\s*\(/i);
    expect(body).toContain("public.pos_payments");
    // Que NO haya un join directo a pos_payments (fan-out) en el helper.
    expect(body).not.toMatch(/join\s+public\.pos_payments/i);
  });

  it("la sede se resuelve por venta → sesión → location_id", () => {
    const body = helper();
    expect(body).toContain("public.pos_sessions");
    expect(body).toMatch(/sess\.location_id\s*=\s*p_location_id/);
  });

  it("la búsqueda cubre número, receptor (F1) y cliente de la venta", () => {
    const body = helper();
    expect(body).toContain("i.full_number ilike");
    expect(body).toContain("i.recipient_data ->> 'name'");
    expect(body).toContain("c.full_name ilike");
  });

  it("el tipo mapea al enum pos_invoice_type", () => {
    expect(helper()).toContain("i.invoice_type = p_invoice_type::public.pos_invoice_type");
  });
});

describe("facturas SQL — rango de fechas (zona del salón, p_to inclusivo, opcional)", () => {
  it("convierte el rango a la zona del salón con p_to inclusivo (día siguiente)", () => {
    const body = fnBody("app", "salon_filtered_invoices");
    expect(body).toContain("at time zone");
    expect(body).toContain("(p_to + 1)");
    expect(body).toContain("salons"); // lee salons.timezone
  });

  it("los extremos son opcionales (NULL = sin límite)", () => {
    const body = fnBody("app", "salon_filtered_invoices");
    expect(body).toMatch(/from_ts is null or i\.issued_at >=/);
    expect(body).toMatch(/to_ts\s+is null or i\.issued_at <\s/);
  });
});

describe("facturas SQL — aislamiento multi-tenant (salon_id CON RLS)", () => {
  const ALL_FUNCTIONS = [
    { schema: "app", name: "salon_filtered_invoices" },
    { schema: "public", name: "salon_invoices_filtered" },
    { schema: "public", name: "salon_invoices_totals" },
  ] as const;

  it.each(ALL_FUNCTIONS)(
    "$schema.$name es SECURITY INVOKER (no definer)",
    ({ schema, name }) => {
      const body = fnBody(schema, name).toLowerCase();
      expect(body).toContain("security invoker");
      expect(body, `${name} NO debe ser security definer`).not.toContain(
        "security definer",
      );
    },
  );

  it.each(ALL_FUNCTIONS)(
    "$schema.$name fija search_path='' (anti-inyección)",
    ({ schema, name }) => {
      expect(fnBody(schema, name)).toContain("set search_path = ''");
    },
  );

  it("el helper acota por salon_id = p_salon_id", () => {
    expect(fnBody("app", "salon_filtered_invoices")).toContain(
      "i.salon_id = p_salon_id",
    );
  });
});

describe("facturas SQL — permisos (authenticated, nunca anon/public)", () => {
  it.each(PUBLIC_FUNCTIONS)(
    "%s: REVOKE public + GRANT execute authenticated",
    (name) => {
      expect(MIGRATION).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\b[\\s\\S]*?from public`),
      );
      expect(MIGRATION).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}\\b[\\s\\S]*?to authenticated`,
        ),
      );
    },
  );

  it("el helper interno también se concede a authenticated (lo llaman las públicas)", () => {
    expect(MIGRATION).toMatch(
      /grant execute on function app\.salon_filtered_invoices\b[\s\S]*?to authenticated/,
    );
  });

  it("ninguna función se concede a anon", () => {
    expect(MIGRATION).not.toMatch(/to\s+anon\b/);
  });
});

describe("facturas SQL — dinero en céntimos (bigint, no float)", () => {
  it("las sumas de totales se castean a bigint", () => {
    expect(MIGRATION).toMatch(/sum\(f\.taxable_base_cents\), 0\)::bigint/);
    expect(MIGRATION).toMatch(/sum\(f\.tax_cents\), 0\)::bigint/);
    expect(MIGRATION).toMatch(/sum\(f\.total_cents\), 0\)::bigint/);
  });

  it("no hay aritmética float sobre importes", () => {
    expect(MIGRATION).not.toMatch(/::float/);
  });
});
