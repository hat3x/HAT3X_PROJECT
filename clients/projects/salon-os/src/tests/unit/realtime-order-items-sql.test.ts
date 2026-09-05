import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810120000_realtime_order_items.sql"),
  "utf8",
).toLowerCase();

describe("migración realtime order_items", () => {
  it("añade order_items a la publicación supabase_realtime de forma idempotente", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.order_items");
    expect(SQL).toContain("pg_publication_tables");
    expect(SQL).toContain("'order_items'");
  });
});
