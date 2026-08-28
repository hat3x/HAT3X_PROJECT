import { describe, it, expect } from "vitest";
import { aSlug } from "@/lib/texto";

describe("generación de identificadores", () => {
  it("pasa a minúsculas y une con guiones", () => {
    expect(aSlug("100 Montaditos")).toBe("100-montaditos");
    expect(aSlug("De Nueve a Nueve")).toBe("de-nueve-a-nueve");
  });

  it("quita las tildes, que el identificador no las admite", () => {
    expect(aSlug("Clínica Dental Biodental")).toBe("clinica-dental-biodental");
    expect(aSlug("Jesús Peralta Peluqueros")).toBe("jesus-peralta-peluqueros");
  });

  it("convierte la eñe en n", () => {
    expect(aSlug("Diseño Ñoño")).toBe("diseno-nono");
  });

  it("descarta la puntuación y colapsa los separadores", () => {
    expect(aSlug("MTDI & Co.")).toBe("mtdi-co");
    expect(aSlug("  espacios   raros  ")).toBe("espacios-raros");
    expect(aSlug("A -- B")).toBe("a-b");
  });

  it("no deja guiones sueltos en los extremos", () => {
    expect(aSlug("¡Hola!")).toBe("hola");
    expect(aSlug("-borde-")).toBe("borde");
  });

  it("devuelve cadena vacía si no queda nada aprovechable", () => {
    expect(aSlug("")).toBe("");
    expect(aSlug("!!!")).toBe("");
  });

  // La prueba que de verdad importa: lo que genera tiene que pasar la
  // validación de acciones-clientes.ts, o el formulario propondría un
  // identificador que el servidor rechaza.
  it("produce siempre algo que el validador acepta", () => {
    const patron = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const nombre of [
      "Clínica Dental Biodental",
      "100 Montaditos",
      "MTDI & Co.",
      "José Manuel Delgado",
      "Club BioSpa",
    ]) {
      expect(patron.test(aSlug(nombre)), nombre).toBe(true);
    }
  });
});
