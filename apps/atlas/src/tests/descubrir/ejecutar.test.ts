import { describe, it, expect, vi } from "vitest";
import { descubrir, type Puertos } from "@/lib/descubrir/ejecutar";

const AJUSTES = {
  proyectoId: "p-kairos",
  urlSupabase: "https://kairos.ejemplo.test",
  credencialId: "cred-1",
};

/**
 * Puertos falsos con todo en verde. Cada prueba sustituye solo el que le
 * interesa romper, así lo que se afirma es lo que cambia y no el andamiaje.
 */
function puertos(parcial: Partial<Puertos> = {}): Puertos {
  return {
    ajustes: vi.fn(async () => ({ ok: true as const, ajustes: AJUSTES })),
    abrirCredencial: vi.fn(async () => "clave-de-servicio"),
    leerCenso: vi.fn(async () => ({
      ok: true as const,
      tenants: [{ slug: "uno", nombre: "Salón Uno", sector: "peluqueria" }],
    })),
    vigilados: vi.fn(async () => []),
    aplicar: vi.fn(async () => ({ altas: 1, pausados: 0, reactivados: 0 })),
    ...parcial,
  };
}

describe("descubrir", () => {
  it("aplica el plan y devuelve las cuentas", async () => {
    const p = puertos();

    const r = await descubrir(p);

    expect(r).toEqual({ ok: true, altas: 1, pausados: 0, reactivados: 0 });
    expect(p.aplicar).toHaveBeenCalledWith(AJUSTES.proyectoId, {
      alta: [{ slug: "uno", nombre: "Salón Uno", sector: "peluqueria" }],
      pausar: [],
      reactivar: [],
    });
  });

  it("abre la credencial del proyecto y la usa para leer el censo", async () => {
    const p = puertos();

    await descubrir(p);

    expect(p.abrirCredencial).toHaveBeenCalledWith(AJUSTES.credencialId);
    expect(p.leerCenso).toHaveBeenCalledWith(
      AJUSTES.urlSupabase,
      "clave-de-servicio"
    );
  });

  // Lo que de verdad protege esta función: si el censo no llega, Atlas no sabe
  // quién sigue de alta. Escribir cualquier cosa con esa duda encima es
  // exactamente lo que no puede pasar — pausaría clientes vivos.
  it("no toca la base si el censo falla", async () => {
    const p = puertos({
      leerCenso: vi.fn(async () => ({
        ok: false as const,
        error: "Kairos respondió 404 a atlas_list_salons.",
      })),
    });

    const r = await descubrir(p);

    expect(r).toEqual({
      ok: false,
      error: "Kairos respondió 404 a atlas_list_salons.",
    });
    expect(p.aplicar).not.toHaveBeenCalled();
  });

  // Abrir una credencial deja rastro en `credencial_usos`. Si la configuración
  // ni siquiera está, no hay nada que abrir: un registro de uso sin uso
  // ensuciaría el único rastro que serviría para investigar una fuga.
  it("no abre la credencial si falta la configuración", async () => {
    const p = puertos({
      ajustes: vi.fn(async () => ({
        ok: false as const,
        error: "No hay ningún proyecto con slug «kairos».",
      })),
    });

    const r = await descubrir(p);

    expect(r).toEqual({
      ok: false,
      error: "No hay ningún proyecto con slug «kairos».",
    });
    expect(p.abrirCredencial).not.toHaveBeenCalled();
    expect(p.leerCenso).not.toHaveBeenCalled();
  });

  // El caso corriente: el censo coincide con lo vigilado. Llamar a `aplicar`
  // con un plan vacío no rompería nada, pero dejaría una escritura cada hora en
  // la base sin que nada cambie.
  it("no escribe nada cuando el plan no mueve ninguna pieza", async () => {
    const p = puertos({
      vigilados: vi.fn(async () => [{ id: "s1", slug: "uno", activo: true }]),
    });

    const r = await descubrir(p);

    expect(r).toEqual({ ok: true, altas: 0, pausados: 0, reactivados: 0 });
    expect(p.aplicar).not.toHaveBeenCalled();
  });

  // Un censo vacío casi siempre significa que la llamada salió mal, no que
  // HAT3X se haya quedado sin clientes. `reconciliar` ya lo defiende; esto fija
  // que la orquestación no lo esquiva por su cuenta.
  it("con censo vacío no pausa a nadie", async () => {
    const p = puertos({
      leerCenso: vi.fn(async () => ({ ok: true as const, tenants: [] })),
      vigilados: vi.fn(async () => [{ id: "s1", slug: "uno", activo: true }]),
    });

    const r = await descubrir(p);

    expect(r).toEqual({ ok: true, altas: 0, pausados: 0, reactivados: 0 });
    expect(p.aplicar).not.toHaveBeenCalled();
  });

  // La ruta que llama a esto la despierta pg_cron. Una excepción sin recoger
  // sería un 500 sin explicación en un sitio donde nadie mira.
  it("convierte una excepción en un resultado con su motivo", async () => {
    const p = puertos({
      vigilados: vi.fn(async () => {
        throw new Error("la conexión se cayó");
      }),
    });

    const r = await descubrir(p);

    expect(r).toEqual({ ok: false, error: "la conexión se cayó" });
  });

  it("pausa y reactiva lo que diga el reconciliador", async () => {
    const p = puertos({
      leerCenso: vi.fn(async () => ({
        ok: true as const,
        tenants: [{ slug: "vuelve", nombre: "Vuelve", sector: "peluqueria" }],
      })),
      vigilados: vi.fn(async () => [
        { id: "s1", slug: "se-va", activo: true },
        { id: "s2", slug: "vuelve", activo: false },
      ]),
      aplicar: vi.fn(async () => ({ altas: 0, pausados: 1, reactivados: 1 })),
    });

    const r = await descubrir(p);

    expect(r).toEqual({ ok: true, altas: 0, pausados: 1, reactivados: 1 });
    expect(p.aplicar).toHaveBeenCalledWith(AJUSTES.proyectoId, {
      alta: [],
      pausar: [{ id: "s1", slug: "se-va", activo: true }],
      reactivar: [{ id: "s2", slug: "vuelve", activo: false }],
    });
  });
});
