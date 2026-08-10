import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810140000_realtime_dining.sql"),
  "utf8",
).toLowerCase();

describe("migración realtime sala", () => {
  it("añade dining_tables y orders a supabase_realtime, idempotente", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.dining_tables");
    expect(SQL).toContain("alter publication supabase_realtime add table public.orders");
    expect(SQL).toContain("pg_publication_tables");
  });
});
