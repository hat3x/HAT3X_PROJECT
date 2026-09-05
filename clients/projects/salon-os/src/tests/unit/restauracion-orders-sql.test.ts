import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810100000_restauracion_orders.sql"),
  "utf8",
).toLowerCase();

describe("migración orders", () => {
  it("crea los enums de estado de pedido e ítem", () => {
    expect(SQL).toContain("create type public.order_status as enum");
    expect(SQL).toContain("'abierta'");
    expect(SQL).toContain("create type public.order_item_status as enum");
    expect(SQL).toContain("'enviado'");
    expect(SQL).toContain("'anulado'");
  });

  it("orders con id de cliente, idempotency_key único por salón y clave compuesta", () => {
    expect(SQL).toContain("create table if not exists public.orders");
    expect(SQL).toContain("idempotency_key");
    expect(SQL).toContain("unique (salon_id, idempotency_key)");
    expect(SQL).toContain("orders_id_salon_key unique (id, salon_id)");
  });

  it("order_items append-only: void_of_item_id, unit_price_cents>=0, FKs compuestas", () => {
    expect(SQL).toContain("create table if not exists public.order_items");
    expect(SQL).toContain("void_of_item_id");
    expect(SQL).toContain("check (unit_price_cents >= 0)");
    expect(SQL).toContain("foreign key (order_id, salon_id)");
    expect(SQL).toContain("foreign key (product_id, salon_id)");
    expect(SQL).toContain("foreign key (station_id, salon_id)");
    expect(SQL).toContain("modifiers_snapshot jsonb");
  });

  it("añade pos_sales.order_id con FK compuesta a orders", () => {
    expect(SQL).toContain("alter table public.pos_sales");
    expect(SQL).toContain("add column if not exists order_id uuid");
    expect(SQL).toContain("references public.orders (id, salon_id)");
  });

  it("RLS: miembros crean/leen (operativa) y guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("members_insert_orders");
    expect(SQL).toContain("do $guard$");
  });
});
