import { describe, it, expect } from "vitest";
import { PALETAS, esPaletaCalida, atributosTema } from "@/lib/tema/tokens";

describe("tokens de tema", () => {
  it("expone exactamente las cinco paletas acordadas", () => {
    expect([...PALETAS]).toEqual([
      "zafiro", "nebulosa", "oceano", "grafito", "crepusculo",
    ]);
  });

  it("solo crepusculo es cálida", () => {
    const calidas = PALETAS.filter(esPaletaCalida);
    expect(calidas).toEqual(["crepusculo"]);
  });

  it("produce los atributos que el CSS usa como selector", () => {
    expect(atributosTema("oscuro", "nebulosa")).toEqual({
      "data-tema": "oscuro",
      "data-paleta": "nebulosa",
    });
  });
});
