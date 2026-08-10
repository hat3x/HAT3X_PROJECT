import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810130000_restauracion_sala.sql"),
  "utf8",
).toLowerCase();

describe("migración sala", () => {
  it("crea los enums de forma y estado de mesa", () => {
    expect(SQL).toContain("create type public.table_shape as enum");
    expect(SQL).toContain("create type public.table_status as enum");
    expect(SQL).toContain("'ocupada'");
    expect(SQL).toContain("'por_limpiar'");
  });
  it("crea dining_zones y dining_tables con clave compuesta", () => {
    expect(SQL).toContain("create table if not exists public.dining_zones");
    expect(SQL).toContain("create table if not exists public.dining_tables");
    expect(SQL).toContain("dining_zones_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("dining_tables_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("check (capacity_max >= capacity_min)");
    expect(SQL).toContain("foreign key (zone_id, salon_id)");
  });
  it("enlaza orders con la mesa (dining_table_id + covers)", () => {
    expect(SQL).toContain("add column if not exists dining_table_id uuid");
    expect(SQL).toContain("add column if not exists covers integer");
    expect(SQL).toContain("references public.dining_tables (id, salon_id)");
  });
  it("RLS: select miembros, gestion managers, update miembros en tables; guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("members_update_dining_tables");
    expect(SQL).toContain("do $guard$");
  });
});
