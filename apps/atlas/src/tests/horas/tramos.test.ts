import { describe, it, expect } from "vitest";
import { minutosDe, resumir, formatearMinutos, type Tramo } from "@/lib/horas/tramos";
import { TOPE_HORAS } from "@/lib/horas/abiertos";

const AHORA = Date.parse("2026-08-31T20:00:00Z");
const min = (n: number) => n * 60_000;

function tramo(p: Partial<Tramo> = {}): Tramo {
  return {
    id: "t1",
    usuarioId: "u1",
    usuarioNombre: "Jose",
    proyectoId: "p1",
    proyectoNombre: "Kairos",
    clienteId: "c1",
    clienteNombre: "Biodental",
    inicio: new Date(AHORA - min(90)).toISOString(),
    fin: new Date(AHORA - min(30)).toISOString(),
    origen: "atlas",
    nota: null,
    ...p,
  };
}

describe("minutosDe", () => {
  it("un tramo cerrado dura lo que dura", () => {
    expect(minutosDe(tramo(), AHORA)).toBe(60);
  });

  it("uno en curso dura hasta ahora", () => {
    expect(minutosDe(tramo({ fin: null }), AHORA)).toBe(90);
  });

  it("nunca cuenta más del tope, aunque siga abierto", () => {
    const viejo = tramo({ fin: null, inicio: new Date(AHORA - min(60 * 30)).toISOString() });
    expect(minutosDe(viejo, AHORA)).toBe(TOPE_HORAS * 60);
  });

  it("los segundos sueltos se redondean al minuto más cercano", () => {
    const t = tramo({ inicio: new Date(AHORA - 90_500).toISOString(), fin: new Date(AHORA).toISOString() });
    expect(minutosDe(t, AHORA)).toBe(2);
  });
});

describe("resumir", () => {
  it("con nada, todo a cero y sin sospechosos", () => {
    const r = resumir([], AHORA);
    expect(r.totalMin).toBe(0);
    expect(r.porCliente).toEqual([]);
    expect(r.sospechosos).toEqual([]);
    expect(r.ultimoInicio).toBeNull();
  });

  it("los tres desgloses suman lo mismo que el total, aunque haya tramos sin asignar", () => {
    const r = resumir(
      [
        tramo(),
        tramo({ id: "t2", clienteId: null, clienteNombre: null }),
        tramo({ id: "t3", proyectoId: null, proyectoNombre: null, usuarioId: "u2", usuarioNombre: "Ana" }),
      ],
      AHORA
    );
    const suma = (f: { minutos: number }[]) => f.reduce((t, x) => t + x.minutos, 0);
    expect(r.totalMin).toBe(180);
    expect(suma(r.porCliente)).toBe(180);
    expect(suma(r.porProyecto)).toBe(180);
    expect(suma(r.porPersona)).toBe(180);
    expect(r.porCliente.find((f) => f.id === null)?.nombre).toBe("Sin asignar");
  });

  it("separa lo medido de lo añadido", () => {
    const r = resumir([tramo(), tramo({ id: "t2", origen: "anadido" })], AHORA);
    expect(r.medidosMin).toBe(60);
    expect(r.anadidosMin).toBe(60);
  });

  it("ordena cada desglose de más a menos minutos", () => {
    const r = resumir(
      [tramo(), tramo({ id: "t2", clienteId: "c2", clienteNombre: "Club", inicio: new Date(AHORA - min(300)).toISOString(), fin: new Date(AHORA).toISOString() })],
      AHORA
    );
    expect(r.porCliente.map((f) => f.nombre)).toEqual(["Club", "Biodental"]);
  });

  it("un abierto de más de AVISO_HORAS es sospechoso; uno reciente no", () => {
    const r = resumir(
      [tramo({ fin: null, inicio: new Date(AHORA - min(60 * 11)).toISOString() }), tramo({ id: "t2", fin: null })],
      AHORA
    );
    expect(r.sospechosos.map((t) => t.id)).toEqual(["t1"]);
  });

  it("el último inicio es el más reciente, cerrado o no", () => {
    const r = resumir([tramo(), tramo({ id: "t2", inicio: new Date(AHORA - min(10)).toISOString(), fin: null })], AHORA);
    expect(r.ultimoInicio).toBe(new Date(AHORA - min(10)).toISOString());
  });

  it("usuario sin nombre pero con ID usa «Sin nombre» en porPersona; sin cliente usa «Sin asignar» en porCliente", () => {
    const r = resumir([tramo({ usuarioNombre: null }), tramo({ id: "t2", clienteId: null, clienteNombre: null })], AHORA);
    const sinNombrePersona = r.porPersona.find((f) => f.nombre === "Sin nombre");
    expect(sinNombrePersona?.id).toBe("u1");
    const sinAsignarCliente = r.porCliente.find((f) => f.nombre === "Sin asignar");
    expect(sinAsignarCliente?.id).toBeNull();
  });
});

describe("formatearMinutos", () => {
  it("horas y minutos, sin ceros de relleno", () => {
    expect(formatearMinutos(0)).toBe("0 min");
    expect(formatearMinutos(45)).toBe("45 min");
    expect(formatearMinutos(60)).toBe("1 h");
    expect(formatearMinutos(150)).toBe("2 h 30 min");
  });
});
