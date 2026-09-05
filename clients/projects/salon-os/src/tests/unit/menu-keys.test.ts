import { describe, it, expect } from "vitest";
import { menuKeys } from "@/lib/queries/menu";

describe("menuKeys", () => {
  it("deriva las sub-keys del salón", () => {
    expect(menuKeys.all("s1")).toEqual(["menu", "s1"]);
    expect(menuKeys.categories("s1")).toEqual(["menu", "s1", "categories"]);
    expect(menuKeys.products("s1")).toEqual(["menu", "s1", "products"]);
  });
});
