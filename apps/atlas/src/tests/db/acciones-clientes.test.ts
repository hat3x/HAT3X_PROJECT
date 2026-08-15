import { describe, it, expect } from "vitest";
import { validarEntradaCliente } from "@/lib/db/acciones-clientes";

describe("validación de un cliente", () => {
  it("acepta lo mínimo imprescindible", async () => {
    const r = await validarEntradaCliente({ nombre: "Dental Demo", slug: "dental-demo" });
    expect(r.ok).toBe(true);
  });

  it("rechaza el nombre vacío", async () => {
    const r = await validarEntradaCliente({ nombre: "  ", slug: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un slug con mayúsculas, espacios, acentos o guion bajo", async () => {
    for (const slug of ["Dental Demo", "dental demo", "dentál-demo", "dental_demo"]) {
      const r = await validarEntradaCliente({ nombre: "X", slug });
      expect(r.ok, `debería rechazar «${slug}»`).toBe(false);
    }
  });

  it("acepta slugs con minúsculas, números y guiones", async () => {
    const r = await validarEntradaCliente({ nombre: "X", slug: "100-montaditos" });
    expect(r.ok).toBe(true);
  });

  it("rechaza un estado que no exista", async () => {
    const r = await validarEntradaCliente({ nombre: "X", slug: "x", estado: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/estado/i);
  });
});
