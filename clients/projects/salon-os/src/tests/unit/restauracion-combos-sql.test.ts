import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809122000_restauracion_combos.sql"),
  "utf8",
).toLowerCase();

describe("migración combos", () => {
  it("crea combo_components con FKs compuestas a producto combo, pieza y estación", () => {
    expect(SQL).toContain("create table if not exists public.combo_components");
    expect(SQL).toContain("foreign key (combo_product_id, salon_id)");
    expect(SQL).toContain("foreign key (component_product_id, salon_id)");
    expect(SQL).toContain("foreign key (station_id_override, salon_id)");
    expect(SQL).toContain("references public.stations (id, salon_id)");
  });

  it("qty es positivo y hay clave compuesta (id, salon_id)", () => {
    expect(SQL).toContain("qty");
    expect(SQL).toContain("check (qty > 0)");
    expect(SQL).toContain("combo_components_id_salon_key unique (id, salon_id)");
  });

  it("RLS + guardián", () => {
    expect(SQL).toContain("salon_id in (select app.user_salon_ids())");
    expect(SQL).toContain("app.has_salon_role(salon_id, array['owner','manager']::public.member_role[])");
    expect(SQL).toContain("do $guard$");
  });
});
