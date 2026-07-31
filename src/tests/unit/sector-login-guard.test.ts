import { describe, it, expect } from "vitest";
import { parseSectorParam, sectorMismatchMessage } from "@/lib/auth/sector-login";

describe("parseSectorParam", () => {
  it("acepta los tres sectores válidos", () => {
    expect(parseSectorParam("odontologia")).toBe("odontologia");
    expect(parseSectorParam("peluqueria")).toBe("peluqueria");
    expect(parseSectorParam("restauracion")).toBe("restauracion");
  });
  it("rechaza basura / vacío / null", () => {
    expect(parseSectorParam("dentista")).toBeNull();
    expect(parseSectorParam("")).toBeNull();
    expect(parseSectorParam(null)).toBeNull();
    expect(parseSectorParam(undefined)).toBeNull();
  });
});

describe("sectorMismatchMessage", () => {
  it("null cuando coincide", () => {
    expect(sectorMismatchMessage("odontologia", "odontologia")).toBeNull();
  });
  it("mensaje legible cuando no coincide (nombra ambos)", () => {
    const msg = sectorMismatchMessage("odontologia", "peluqueria");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Peluquería");
    expect(msg).toContain("Odontología");
  });
});
