import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809120000_restauracion_menu_base.sql"),
  "utf8",
).toLowerCase();

describe("migración catálogo base restauración", () => {
  it("crea el enum allergen con los 14 alérgenos UE", () => {
    expect(SQL).toContain("create type public.allergen as enum");
    for (const a of ["gluten", "crustaceos", "huevos", "pescado", "lacteos", "sesamo", "moluscos"]) {
      expect(SQL).toContain(`'${a}'`);
    }
  });

  it("crea menu_categories y stations con clave compuesta (id, salon_id)", () => {
    expect(SQL).toContain("create table if not exists public.menu_categories");
    expect(SQL).toContain("create table if not exists public.stations");
    expect(SQL).toContain("menu_categories_id_salon_key unique (id, salon_id)");
    expect(SQL).toContain("stations_id_salon_key unique (id, salon_id)");
  });

  it("extiende products con category_id/station_id por FK compuesta y campos de carta", () => {
    expect(SQL).toContain("add column if not exists category_id uuid");
    expect(SQL).toContain("add column if not exists station_id  uuid");
    expect(SQL).toContain("add column if not exists is_combo");
    expect(SQL).toContain("allergens    public.allergen[]");
    expect(SQL).toContain("foreign key (category_id, salon_id)");
    expect(SQL).toContain("references public.menu_categories (id, salon_id)");
  });

  it("habilita RLS y separa lectura (miembros) de gestión (owner/manager)", () => {
    expect(SQL).toContain("alter table public.menu_categories enable row level security");
    expect(SQL).toContain("alter table public.stations enable row level security");
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
  });

  it("incluye un bloque guardián", () => {
    expect(SQL).toContain("do $guard$");
    expect(SQL).toContain("raise exception");
  });
});
