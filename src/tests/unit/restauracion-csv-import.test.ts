import { describe, it, expect } from "vitest";
import { parseMenuCsv } from "@/lib/restauracion/csv-import";

const CSV = [
  "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo",
  "Montaditos,Montadito de lomo,1,50,10,Cocina,gluten;lacteos,no",
  "Bebidas,Caña,1,80,10,Barra,,no",
  "Combos,Combo desayuno,3,50,10,Cocina,gluten,si",
].join("\n");

describe("parseMenuCsv", () => {
  it("convierte euros (entero,decimales) a céntimos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.priceCents).toBe(150);
    expect(r.products.find((p) => p.name === "Caña")?.priceCents).toBe(180);
  });
  it("deduplica categorías y estaciones", () => {
    const r = parseMenuCsv(CSV);
    expect(r.categories.sort()).toEqual(["Bebidas", "Combos", "Montaditos"]);
    expect(r.stations.sort()).toEqual(["Barra", "Cocina"]);
  });
  it("separa alérgenos por ; y marca combos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.allergens).toEqual(["gluten", "lacteos"]);
    expect(r.products.find((p) => p.name === "Combo desayuno")?.isCombo).toBe(true);
  });
  it("recoge error de IVA inválido sin abortar", () => {
    const bad = "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo\nX,Y,1,00,7,Cocina,,no";
    const r = parseMenuCsv(bad);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
