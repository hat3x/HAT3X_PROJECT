// src/tests/rentabilidad/margen.test.ts
import { describe, it, expect } from "vitest";
import { calcularMargen, costeDeMinutos, type FacturaMes, type GastoMes, type TramoMes } from "@/lib/rentabilidad/margen";

const COSTE = 3000; // 30 €/h en céntimos

const fBio: FacturaMes = {
  clienteId: "c-bio", clienteNombre: "Biodental", baseCentimos: 35000,
  lineas: [
    { proyectoId: "p-sara", proyectoNombre: "Sara", importeCentimos: 29000 },
    { proyectoId: "p-kairos", proyectoNombre: "Kairos", importeCentimos: 6000 },
  ],
};
const fClub: FacturaMes = {
  clienteId: "c-club", clienteNombre: "Club", baseCentimos: 10000,
  lineas: [{ proyectoId: null, proyectoNombre: null, importeCentimos: 10000 }],
};
const gastos: GastoMes[] = [
  { clienteId: "c-bio", clienteNombre: "Biodental", proyectoId: "p-sara", proyectoNombre: "Sara", baseCentimos: 4830 },
  { clienteId: null, clienteNombre: null, proyectoId: "p-kairos", proyectoNombre: "Kairos", baseCentimos: 2500 }, // Supabase de Kairos
  { clienteId: "c-club", clienteNombre: "Club", proyectoId: null, proyectoNombre: null, baseCentimos: 940 },
  { clienteId: null, clienteNombre: null, proyectoId: null, proyectoNombre: null, baseCentimos: 2000 }, // Vercel
];
const tramos: TramoMes[] = [
  { clienteId: "c-bio", clienteNombre: "Biodental", proyectoId: "p-sara", proyectoNombre: "Sara", minutos: 120 },
  { clienteId: null, clienteNombre: null, proyectoId: "p-kairos", proyectoNombre: "Kairos", minutos: 60 },
  { clienteId: null, clienteNombre: null, proyectoId: null, proyectoNombre: null, minutos: 30 },
];

describe("costeDeMinutos", () => {
  it("redondea una sola vez, al céntimo", () => {
    expect(costeDeMinutos(60, 3000)).toBe(3000);
    expect(costeDeMinutos(1, 3000)).toBe(50);
    expect(costeDeMinutos(7, 3333)).toBe(389); // 388,85 → 389
    expect(costeDeMinutos(0, 3000)).toBe(0);
  });
});

describe("calcularMargen", () => {
  const r = calcularMargen({ facturas: [fBio, fClub], gastos, tramos, costeHoraCentimos: COSTE });

  it("por cliente: facturado − gastos con su cliente − horas con su cliente", () => {
    const bio = r.porCliente.find((f) => f.id === "c-bio")!;
    expect(bio).toEqual({ id: "c-bio", nombre: "Biodental", facturadoCentimos: 35000, gastosCentimos: 4830, minutos: 120, horasCentimos: 6000, margenCentimos: 24170 });
    const club = r.porCliente.find((f) => f.id === "c-club")!;
    expect(club.margenCentimos).toBe(10000 - 940);
  });

  it("lo que tiene proyecto pero no cliente va a «sin cliente», sin repartir", () => {
    expect(r.sinCliente).toEqual({ gastosCentimos: 2500, minutos: 60, horasCentimos: 3000 });
  });

  it("por proyecto: el facturado sale de las líneas, y el Supabase de Kairos sí es directo aquí", () => {
    const kairos = r.porProyecto.find((f) => f.id === "p-kairos")!;
    expect(kairos).toEqual({ id: "p-kairos", nombre: "Kairos", facturadoCentimos: 6000, gastosCentimos: 2500, minutos: 60, horasCentimos: 3000, margenCentimos: 500 });
    const sara = r.porProyecto.find((f) => f.id === "p-sara")!;
    expect(sara.facturadoCentimos).toBe(29000);
  });

  it("lo que tiene cliente pero no proyecto va a «sin proyecto»", () => {
    expect(r.sinProyecto.gastosCentimos).toBe(940);
    // y la línea de factura sin proyecto es facturado sin proyecto
    expect(r.porProyecto.find((f) => f.id === "sin-proyecto")).toBeUndefined();
    expect(r.total.facturadoCentimos - r.porProyecto.reduce((t, f) => t + f.facturadoCentimos, 0)).toBe(10000);
  });

  it("la estructura es lo que no tiene ningún contador, una sola vez", () => {
    expect(r.estructura).toEqual({ gastosCentimos: 2000, minutos: 30, horasCentimos: 1500 });
  });

  it("los dos ejes cuadran con el total del negocio", () => {
    const total = r.total;
    expect(total.facturadoCentimos).toBe(45000);
    expect(total.gastosCentimos).toBe(4830 + 2500 + 940 + 2000);
    expect(total.minutos).toBe(210);
    expect(total.horasCentimos).toBe(10500);
    expect(total.margenCentimos).toBe(45000 - 10270 - 10500);
    const sumaClientes = r.porCliente.reduce((t, f) => t + f.margenCentimos, 0);
    expect(sumaClientes - r.sinCliente.gastosCentimos - r.sinCliente.horasCentimos - r.estructura.gastosCentimos - r.estructura.horasCentimos).toBe(total.margenCentimos);
    const sumaProyectos = r.porProyecto.reduce((t, f) => t + f.margenCentimos, 0);
    const facturadoSinProyecto = 10000;
    expect(sumaProyectos + facturadoSinProyecto - r.sinProyecto.gastosCentimos - r.sinProyecto.horasCentimos - r.estructura.gastosCentimos - r.estructura.horasCentimos).toBe(total.margenCentimos);
  });

  it("ordena de más a menos margen", () => {
    expect(r.porCliente.map((f) => f.id)).toEqual(["c-bio", "c-club"]);
  });

  it("con coste cero, las horas cuentan cero pero los minutos se ven", () => {
    const sin = calcularMargen({ facturas: [fBio], gastos: [], tramos, costeHoraCentimos: 0 });
    expect(sin.porCliente[0]?.horasCentimos).toBe(0);
    expect(sin.porCliente[0]?.minutos).toBe(120);
  });

  it("un cliente con gastos u horas pero sin factura aparece con facturado cero", () => {
    const solo = calcularMargen({ facturas: [], gastos: [gastos[0]!], tramos: [], costeHoraCentimos: COSTE });
    expect(solo.porCliente).toEqual([{ id: "c-bio", nombre: "Biodental", facturadoCentimos: 0, gastosCentimos: 4830, minutos: 0, horasCentimos: 0, margenCentimos: -4830 }]);
  });
});
