import { describe, it, expect } from "vitest";
import { validarApariencia } from "@/lib/db/apariencia";
import { PALETAS } from "@/lib/tema/tokens";

describe("validación de apariencia", () => {
  it("acepta las diez combinaciones de tema y paleta", async () => {
    for (const tema of ["claro", "oscuro"]) {
      for (const paleta of PALETAS) {
        expect((await validarApariencia(tema, paleta)).ok, `${tema}/${paleta}`).toBe(
          true
        );
      }
    }
  });

  it("rechaza un tema que no exista", async () => {
    const r = await validarApariencia("sepia", "zafiro");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tema/i);
  });

  it("rechaza una paleta que no exista", async () => {
    const r = await validarApariencia("oscuro", "fucsia");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/paleta/i);
  });

  // El selector manda strings que vienen del navegador: nadie garantiza que
  // sean uno de los diez válidos aunque la interfaz solo ofrezca esos.
  it("rechaza la cadena vacía en ambos campos", async () => {
    expect((await validarApariencia("", "zafiro")).ok).toBe(false);
    expect((await validarApariencia("oscuro", "")).ok).toBe(false);
  });
});
