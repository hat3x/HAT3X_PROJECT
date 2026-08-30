import { describe, it, expect } from "vitest";
import { convertir, type FichajeViejo } from "../../../scripts/migrar/fichajes";

const CLIENTES = new Map([["biodental", "c-bio"], ["100-montaditos", "c-100"]]);

describe("convertir", () => {
  it("un tramo cerrado con cliente conocido se convierte", () => {
    const viejo: FichajeViejo = { entrada: "2026-08-06T14:05:02+02:00", salida: "2026-08-07T00:57:27+02:00", cliente_principal: "100-montaditos" };
    const r = convertir([viejo], CLIENTES);
    expect(r.filas).toEqual([
      { inicio: "2026-08-06T12:05:02.000Z", fin: "2026-08-06T22:57:27.000Z", clienteId: "c-100", clienteSlug: "100-montaditos" },
    ]);
    expect(r.sinCliente).toEqual([]);
  });

  it("un cliente desconocido se conserva sin cliente y se cuenta", () => {
    const r = convertir([{ entrada: "2026-08-07T21:07:38+02:00", salida: "2026-08-08T00:22:04+02:00", cliente_principal: "mtdi" }], CLIENTES);
    // `noUncheckedIndexedAccess` obliga a la aserción: el índice [0] existe
    // porque el array de entrada tiene un elemento, tsc no puede saberlo.
    expect(r.filas[0]!.clienteId).toBeNull();
    expect(r.sinCliente).toEqual(["mtdi"]);
  });

  it("un tramo de segundos se descarta: es una prueba del botón, no trabajo", () => {
    const r = convertir([{ entrada: "2026-08-06T03:29:41+02:00", salida: "2026-08-06T03:29:44+02:00", cliente_principal: "biodental" }], CLIENTES);
    expect(r.filas).toEqual([]);
    expect(r.descartados).toBe(1);
  });

  it("un tramo de más de 16 horas se parte en tramos de 16 y el resto", () => {
    const r = convertir([{ entrada: "2026-08-01T00:00:00Z", salida: "2026-08-01T20:00:00Z", cliente_principal: "biodental" }], CLIENTES);
    expect(r.filas.map((f) => [f.inicio, f.fin])).toEqual([
      ["2026-08-01T00:00:00.000Z", "2026-08-01T16:00:00.000Z"],
      ["2026-08-01T16:00:00.000Z", "2026-08-01T20:00:00.000Z"],
    ]);
  });
});
