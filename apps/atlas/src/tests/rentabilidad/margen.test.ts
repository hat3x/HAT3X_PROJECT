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

  // Ronda de arreglo 1: con coste no exacto (3333) y minutos que no son
  // múltiplos de 60, redondear el total de minutos de una sola vez YA NO
  // cuadra con la suma de las filas: 2 clientes de 1 minuto cada uno dan
  // 56 + 56 = 112 en las filas, pero redondear el total (2 minutos) da 111.
  // `total.horasCentimos` se define como la suma de filas — no el redondeo
  // del total — para que la pantalla, que enseña las dos cosas juntas,
  // nunca muestre un total que no cuadre con lo que hay encima.
  it("con coste y minutos que no cuadran al redondear el total, el total es la suma de las filas, en los dos ejes", () => {
    const COSTE_IMPAR = 3333;
    const tramosImpares: TramoMes[] = [
      { clienteId: "c1", clienteNombre: "Uno", proyectoId: "p1", proyectoNombre: "Proyecto Uno", minutos: 1 },
      { clienteId: "c2", clienteNombre: "Dos", proyectoId: "p2", proyectoNombre: "Proyecto Dos", minutos: 7 },
      // Sin cliente, con proyecto: alimenta `sinCliente` en el eje de
      // cliente y una fila de `porProyecto` propia en el eje de proyecto.
      { clienteId: null, clienteNombre: null, proyectoId: "p3", proyectoNombre: "Proyecto Tres", minutos: 13 },
      // Ni cliente ni proyecto: estructura, la misma línea en los dos ejes.
      { clienteId: null, clienteNombre: null, proyectoId: null, proyectoNombre: null, minutos: 1 },
    ];
    const r2 = calcularMargen({ facturas: [], gastos: [], tramos: tramosImpares, costeHoraCentimos: COSTE_IMPAR });

    // Las filas, calculadas a mano: 56, 389, 722 y 56.
    const sumaEjeCliente = r2.porCliente.reduce((t, f) => t + f.horasCentimos, 0) + r2.sinCliente.horasCentimos + r2.estructura.horasCentimos;
    const sumaEjeProyecto = r2.porProyecto.reduce((t, f) => t + f.horasCentimos, 0) + r2.sinProyecto.horasCentimos + r2.estructura.horasCentimos;
    expect(r2.total.horasCentimos).toBe(1223);
    expect(sumaEjeCliente).toBe(1223);
    expect(sumaEjeProyecto).toBe(1223);

    // Y no el redondeo directo del total de minutos (1222): las dos formas
    // de cuadrar difieren aquí a propósito, para fijar cuál gana.
    expect(costeDeMinutos(r2.total.minutos, COSTE_IMPAR)).toBe(1222);
    expect(r2.total.horasCentimos).not.toBe(costeDeMinutos(r2.total.minutos, COSTE_IMPAR));

    // Y el margen del total cuadra por los dos ejes, con este total de horas.
    const sumaMargenClientes = r2.porCliente.reduce((t, f) => t + f.margenCentimos, 0);
    expect(sumaMargenClientes - r2.sinCliente.gastosCentimos - r2.sinCliente.horasCentimos - r2.estructura.gastosCentimos - r2.estructura.horasCentimos).toBe(r2.total.margenCentimos);
    const sumaMargenProyectos = r2.porProyecto.reduce((t, f) => t + f.margenCentimos, 0);
    const facturadoSinProyecto2 = 0;
    expect(sumaMargenProyectos + facturadoSinProyecto2 - r2.sinProyecto.gastosCentimos - r2.sinProyecto.horasCentimos - r2.estructura.gastosCentimos - r2.estructura.horasCentimos).toBe(r2.total.margenCentimos);
  });
});
