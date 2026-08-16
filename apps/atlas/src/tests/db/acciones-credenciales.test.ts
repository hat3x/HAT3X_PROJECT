import { describe, it, expect } from "vitest";
import { validarCredencial } from "@/lib/db/acciones-credenciales";

// Secretos inventados para la prueba: no abren nada.
const base = {
  proveedor: "retell",
  etiqueta: "API key produccion",
  secreto: "sk_live_abc123",
  proyectoId: null,
};

describe("validación de una credencial", () => {
  it("acepta una entrada correcta", async () => {
    expect((await validarCredencial(base)).ok).toBe(true);
  });

  it("acepta credencial global, sin proyecto", async () => {
    expect((await validarCredencial({ ...base, proyectoId: null })).ok).toBe(true);
  });

  it("exige proveedor", async () => {
    const r = await validarCredencial({ ...base, proveedor: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/proveedor/i);
  });

  it("exige etiqueta: dentro de un año no sabrás cuál es cuál", async () => {
    const r = await validarCredencial({ ...base, etiqueta: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/etiqueta/i);
  });

  it("rechaza un secreto demasiado corto", async () => {
    const r = await validarCredencial({ ...base, secreto: "corto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/corto/i);
  });

  it("no impone formato al secreto: cada proveedor tiene el suyo", async () => {
    for (const secreto of [
      "sk_live_abc123",
      "xoxb-1234-5678-abcdefg",
      "eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.zzz",
      "una-frase-larga-como-contrasena",
    ]) {
      expect((await validarCredencial({ ...base, secreto })).ok, secreto).toBe(true);
    }
  });
});
