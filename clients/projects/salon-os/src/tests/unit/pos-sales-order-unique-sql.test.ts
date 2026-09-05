import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * sql-coherence de la migración de backstop de idempotencia (ronda de fix de
 * Task 6): un índice único parcial en `pos_sales.order_id` garantiza en BD que
 * no puede haber dos ventas para el mismo pedido, aunque una condición de
 * carrera se colara por delante del fast-path de `settleOrder`.
 */
const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810110000_pos_sales_order_id_unique.sql"),
  "utf8",
).toLowerCase();

describe("migración pos_sales_order_id_unique", () => {
  it("crea un índice único parcial en pos_sales.order_id", () => {
    expect(SQL).toContain("create unique index");
    expect(SQL).toContain("pos_sales_order_id_unique");
    expect(SQL).toContain("where order_id is not null");
  });
});
