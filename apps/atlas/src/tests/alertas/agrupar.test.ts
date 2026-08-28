import { describe, it, expect } from "vitest";
import { agrupar, type SucesoAviso } from "@/lib/alertas/agrupar";

const VENTANA = 2 * 60 * 1000; // 2 minutos

function suceso(parcial: Partial<SucesoAviso> = {}): SucesoAviso {
  return {
    incidenciaId: "i1",
    proyectoId: "p1",
    proyectoNombre: "Recepcionista Sara",
    servicioNombre: "Agente Retell",
    tipo: "apertura",
    abiertaEn: "2026-08-16T10:00:00.000Z",
    causa: "HTTP 500",
    ...parcial,
  };
}

describe("agrupación de avisos", () => {
  it("sin sucesos no hay avisos", () => {
    expect(agrupar([], VENTANA)).toEqual([]);
  });

  it("un solo servicio caído da un aviso con su nombre y su causa", () => {
    const [aviso] = agrupar([suceso()], VENTANA);
    expect(aviso!.titulo).toBe("Recepcionista Sara: Agente Retell caído");
    expect(aviso!.cuerpo).toBe("HTTP 500");
    expect(aviso!.incidenciaIds).toEqual(["i1"]);
  });

  it("cinco servicios del mismo proyecto en la ventana dan UN aviso", () => {
    // Los instantes se construyen sumando a una base, no formateando segundos a
    // mano: «10:00:60» no es una hora válida y `new Date` devuelve NaN.
    const base = Date.parse("2026-08-16T10:00:00.000Z");
    const sucesos = ["a", "b", "c", "d", "e"].map((n, i) =>
      suceso({
        incidenciaId: n,
        servicioNombre: `Servicio ${n}`,
        abiertaEn: new Date(base + i * 20_000).toISOString(),
      })
    );
    const avisos = agrupar(sucesos, VENTANA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.titulo).toBe("Recepcionista Sara: 5 servicios caídos");
    expect(avisos[0]!.incidenciaIds).toHaveLength(5);
  });

  it("dos proyectos distintos dan dos avisos aunque caigan a la vez", () => {
    const avisos = agrupar(
      [
        suceso(),
        suceso({ incidenciaId: "i2", proyectoId: "p2", proyectoNombre: "Kairos" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
  });

  it("fuera de la ventana son avisos separados", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" }),
        suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:05:00.000Z" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
  });

  it("aperturas y recuperaciones no se mezclan nunca", () => {
    const avisos = agrupar(
      [suceso(), suceso({ incidenciaId: "i2", tipo: "recuperacion" })],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
    expect(avisos.map((a) => a.tipo).sort()).toEqual(["apertura", "recuperacion"]);
  });

  it("la recuperación se lee como buena noticia", () => {
    const [aviso] = agrupar([suceso({ tipo: "recuperacion" })], VENTANA);
    expect(aviso!.titulo).toBe("Recepcionista Sara: Agente Retell recuperado");
    expect(aviso!.cuerpo).toBe("Vuelve a responder");
  });

  it("varias recuperaciones también se agrupan", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", tipo: "recuperacion" }),
        suceso({ incidenciaId: "i2", tipo: "recuperacion", servicioNombre: "n8n" }),
      ],
      VENTANA
    );
    expect(avisos[0]!.titulo).toBe("Recepcionista Sara: 2 servicios recuperados");
  });

  it("sin causa el cuerpo lo dice, en vez de quedarse vacío", () => {
    const [aviso] = agrupar([suceso({ causa: null })], VENTANA);
    expect(aviso!.cuerpo).toBe("Sin detalle del error");
  });

  it("agrupado, el cuerpo enumera los servicios", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", servicioNombre: "Agente Retell" }),
        suceso({ incidenciaId: "i2", servicioNombre: "n8n 02-crear-cita" }),
      ],
      VENTANA
    );
    expect(avisos[0]!.cuerpo).toBe("Agente Retell, n8n 02-crear-cita");
  });

  // El orden de llegada no debe cambiar el resultado: los sucesos vienen de una
  // consulta y su orden no está garantizado.
  it("el resultado no depende del orden de entrada", () => {
    const a = suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" });
    const b = suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:00:30.000Z" });
    expect(agrupar([a, b], VENTANA)).toEqual(agrupar([b, a], VENTANA));
  });

  // Una cadena de caídas separadas por menos de la ventana NO debe encadenarse
  // indefinidamente: la ventana se mide desde el primero del grupo, no desde el
  // anterior. Si no, una caída lenta y progresiva daría un solo aviso enorme.
  it("la ventana se mide desde el primero del grupo, no en cadena", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" }),
        suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:01:30.000Z" }),
        suceso({ incidenciaId: "i3", abiertaEn: "2026-08-16T10:03:00.000Z" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
    expect(avisos[0]!.incidenciaIds).toEqual(["i1", "i2"]);
    expect(avisos[1]!.incidenciaIds).toEqual(["i3"]);
  });
});
