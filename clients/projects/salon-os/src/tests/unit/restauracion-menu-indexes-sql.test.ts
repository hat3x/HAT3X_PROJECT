import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260809120500_restauracion_menu_base_indexes.sql"),
  "utf8",
).toLowerCase();

describe("migración índices FK de products (categoría/estación)", () => {
  it("crea índices para products.category_id y products.station_id", () => {
    expect(SQL).toContain("create index if not exists idx_products_category_id");
    expect(SQL).toContain("idx_products_station_id");
  });
});
