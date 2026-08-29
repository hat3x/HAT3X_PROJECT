import { describe, it, expect } from "vitest";
import { desglosar, type GastoAgrupable } from "@/lib/gastos/desglose";

function gasto(parcial: Partial<GastoAgrupable> = {}): GastoAgrupable {
  return {
    totalCentimos: 1000,
    plataformaId: null,
    plataformaNombre: null,
    clienteId: null,
    clienteNombre: null,
    proyectoId: null,
    proyectoNombre: null,
    ...parcial,
  };
}

describe("desglose de gastos", () => {
  it("sin gastos, los tres desgloses vienen vacíos y el total es cero", () => {
    const d = desglosar([]);
    expect(d.total).toBe(0);
    expect(d.porPlataforma).toEqual([]);
    expect(d.porCliente).toEqual([]);
    expect(d.porProyecto).toEqual([]);
  });

  it("suma por plataforma", () => {
    const d = desglosar([
      gasto({ plataformaId: "p1", plataformaNombre: "Twilio", totalCentimos: 2000 }),
      gasto({ plataformaId: "p1", plataformaNombre: "Twilio", totalCentimos: 500 }),
      gasto({ plataformaId: "p2", plataformaNombre: "Vercel", totalCentimos: 3000 }),
    ]);

    expect(d.porPlataforma).toEqual([
      { id: "p2", nombre: "Vercel", centimos: 3000 },
      { id: "p1", nombre: "Twilio", centimos: 2500 },
    ]);
  });

  // De mayor a menor: lo que se viene a mirar es en qué se va el dinero, y eso
  // se responde con la primera fila, no leyendo la lista entera.
  it("ordena de mayor a menor gasto", () => {
    const d = desglosar([
      gasto({ plataformaId: "a", plataformaNombre: "Poco", totalCentimos: 100 }),
      gasto({ plataformaId: "b", plataformaNombre: "Mucho", totalCentimos: 900 }),
    ]);
    expect(d.porPlataforma.map((f) => f.nombre)).toEqual(["Mucho", "Poco"]);
  });

  // Lo que no tiene plataforma, cliente o proyecto NO desaparece: se agrupa
  // bajo «sin asignar». Si se descartara, los tres desgloses dejarían de sumar
  // el total y nadie sabría por qué.
  it("lo que no tiene plataforma se agrupa como «sin asignar»", () => {
    const d = desglosar([
      gasto({ plataformaId: "p1", plataformaNombre: "Twilio", totalCentimos: 1000 }),
      gasto({ totalCentimos: 400 }),
    ]);

    expect(d.porPlataforma).toEqual([
      { id: "p1", nombre: "Twilio", centimos: 1000 },
      { id: null, nombre: "Sin asignar", centimos: 400 },
    ]);
  });

  it("agrupa igual por cliente y por proyecto", () => {
    const d = desglosar([
      gasto({
        clienteId: "c1",
        clienteNombre: "Biodental",
        proyectoId: "y1",
        proyectoNombre: "Kairos",
        totalCentimos: 700,
      }),
      gasto({ clienteId: "c1", clienteNombre: "Biodental", totalCentimos: 300 }),
    ]);

    expect(d.porCliente).toEqual([{ id: "c1", nombre: "Biodental", centimos: 1000 }]);
    expect(d.porProyecto).toEqual([
      { id: "y1", nombre: "Kairos", centimos: 700 },
      { id: null, nombre: "Sin asignar", centimos: 300 },
    ]);
  });

  // El test que de verdad sostiene la pantalla. Los tres desgloses recorren el
  // mismo dinero por caminos distintos: si uno sale diferente, hay un gasto
  // perdiéndose en alguna agrupación, y eso no se ve a ojo mirando la pantalla.
  it("los tres desgloses suman exactamente el mismo total", () => {
    const gastos = [
      gasto({
        plataformaId: "p1",
        plataformaNombre: "Twilio",
        clienteId: "c1",
        clienteNombre: "Bio",
        totalCentimos: 1234,
      }),
      gasto({ plataformaId: "p2", plataformaNombre: "Vercel", totalCentimos: 5678 }),
      gasto({
        clienteId: "c2",
        clienteNombre: "Spa",
        proyectoId: "y1",
        proyectoNombre: "Sara",
        totalCentimos: 91,
      }),
      gasto({ totalCentimos: 7 }),
    ];
    const d = desglosar(gastos);

    const suma = (filas: { centimos: number }[]) =>
      filas.reduce((t, f) => t + f.centimos, 0);

    expect(d.total).toBe(1234 + 5678 + 91 + 7);
    expect(suma(d.porPlataforma)).toBe(d.total);
    expect(suma(d.porCliente)).toBe(d.total);
    expect(suma(d.porProyecto)).toBe(d.total);
  });

  // Todo en céntimos enteros de punta a punta: es una suma, y sumar euros en
  // coma flotante acumula error justo donde más se nota.
  it("suma en enteros, sin arrastrar decimales", () => {
    const d = desglosar([
      gasto({ totalCentimos: 10 }),
      gasto({ totalCentimos: 20 }),
      gasto({ totalCentimos: 30 }),
    ]);
    expect(d.total).toBe(60);
    expect(Number.isInteger(d.total)).toBe(true);
  });
});
