import { describe, it, expect } from "vitest";
import { kdsKeys } from "@/lib/queries/kds";

describe("kdsKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(kdsKeys.all("s1")).toEqual(["kds", "s1"]);
    expect(kdsKeys.items("s1")).toEqual(["kds", "s1", "items"]);
  });
});
