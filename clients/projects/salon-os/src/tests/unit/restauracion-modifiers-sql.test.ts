import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809121000_restauracion_modifiers.sql"),
  "utf8",
).toLowerCase();

describe("migración modificadores", () => {
  it("crea las tres tablas con clave compuesta (id, salon_id)", () => {
    for (const t of ["modifier_groups", "modifiers", "product_modifier_groups"]) {
      expect(SQL).toContain(`create table if not exists public.${t}`);
      expect(SQL).toContain(`${t}_id_salon_key unique (id, salon_id)`);
    }
  });

  it("modifier_groups valida min<=max y modifiers guarda price_delta_cents (permite negativo)", () => {
    expect(SQL).toContain("min_select");
    expect(SQL).toContain("max_select");
    expect(SQL).toContain("check (min_select <= max_select)");
    expect(SQL).toContain("price_delta_cents integer not null default 0");
  });

  it("product_modifier_groups enlaza product y group por FK compuesta", () => {
    expect(SQL).toContain("foreign key (product_id, salon_id)");
    expect(SQL).toContain("foreign key (group_id, salon_id)");
    expect(SQL).toContain("unique (salon_id, product_id, group_id)");
  });

  it("RLS: lectura miembros, gestión owner/manager, y guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("do $guard$");
  });
});
