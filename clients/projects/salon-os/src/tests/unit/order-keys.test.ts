import { describe, it, expect } from "vitest";
import { orderKeys } from "@/lib/queries/orders";

describe("orderKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(orderKeys.all("s1")).toEqual(["orders", "s1"]);
    expect(orderKeys.open("s1")).toEqual(["orders", "s1", "open"]);
    expect(orderKeys.detail("s1", "o1")).toEqual(["orders", "s1", "detail", "o1"]);
  });
});
