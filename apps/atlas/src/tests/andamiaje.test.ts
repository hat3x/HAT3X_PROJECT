import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("andamiaje", () => {
  it("resuelve el alias @/ y combina clases", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("la última clase de Tailwind gana en conflicto", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
