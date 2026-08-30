import { describe, it, expect } from "vitest";
import { abiertosDemasiado, AVISO_HORAS, type Abierto } from "@/lib/horas/abiertos";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const h = (n: number) => n * 3_600_000;

function abierto(p: Partial<Abierto> = {}): Abierto {
  return {
    id: "f1",
    usuarioId: "u1",
    inicio: new Date(AHORA - h(11)).toISOString(),
    proyectoNombre: "Kairos",
    clienteNombre: "Biodental",
    ...p,
  };
}

describe("abiertosDemasiado", () => {
  it("con nada abierto no avisa", () => {
    expect(abiertosDemasiado([], AHORA)).toEqual([]);
  });

  it("uno de once horas avisa; uno de nueve no", () => {
    const r = abiertosDemasiado(
      [abierto(), abierto({ id: "f2", usuarioId: "u2", inicio: new Date(AHORA - h(9)).toISOString() })],
      AHORA
    );
    expect(r.map((a) => a.fichajeId)).toEqual(["f1"]);
    expect(r[0].horas).toBe(11);
  });

  it("el umbral es inclusivo: justo a las diez horas avisa", () => {
    const r = abiertosDemasiado([abierto({ inicio: new Date(AHORA - h(AVISO_HORAS)).toISOString() })], AHORA);
    expect(r).toHaveLength(1);
  });

  it("el título dice cuánto y de qué; sin proyecto ni cliente, dice «sin asignar»", () => {
    const [con] = abiertosDemasiado([abierto()], AHORA);
    expect(con.titulo).toBe("Llevas 11 horas fichado en Kairos · Biodental");
    const [sin] = abiertosDemasiado([abierto({ proyectoNombre: null, clienteNombre: null })], AHORA);
    expect(sin.titulo).toBe("Llevas 11 horas fichado sin asignar");
    expect(sin.cuerpo).toMatch(/ciérralo/i);
  });

  it("las horas se redondean hacia abajo", () => {
    const [a] = abiertosDemasiado([abierto({ inicio: new Date(AHORA - h(10.9)).toISOString() })], AHORA);
    expect(a.horas).toBe(10);
  });

  it("admite otro límite", () => {
    expect(abiertosDemasiado([abierto()], AHORA, 12)).toEqual([]);
  });
});
