import { describe, it, expect } from "vitest";
import { tableKeys } from "@/lib/queries/tables";

describe("tableKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(tableKeys.all("s1")).toEqual(["tables", "s1"]);
    expect(tableKeys.tables("s1")).toEqual(["tables", "s1", "tables"]);
    expect(tableKeys.openOrders("s1")).toEqual(["tables", "s1", "openOrders"]);
  });
});
