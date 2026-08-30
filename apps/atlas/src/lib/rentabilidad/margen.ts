// src/lib/rentabilidad/margen.ts
//
// El margen de contribución (§6.3). Pura: entran céntimos, salen céntimos.
//
// No se prorratea NADA. Hay dos preguntas y cada una tiene su eje:
//   ¿me interesa este cliente?  → lo que ingresa menos lo que desaparecería
//                                 si lo dejara: lo que tiene SU contador.
//   ¿vive el negocio?           → la suma de márgenes menos la estructura
//                                 entera, una sola vez.
// Lo directo depende del eje: por cliente cuenta lo que tiene cliente_id, por
// proyecto lo que tiene proyecto_id. Lo que no tiene el eje va a una línea
// aparte con nombre honesto, nunca repartido: repartir inventa precisión.
//

export type FacturaMes = {
  clienteId: string;
  clienteNombre: string;
  /** Base, sin IVA: el IVA no es ingreso. */
  baseCentimos: number;
  lineas: { proyectoId: string | null; proyectoNombre: string | null; importeCentimos: number }[];
};

export type GastoMes = {
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  /** Base, sin IVA: el IVA es deducible, no coste. */
  baseCentimos: number;
};

export type TramoMes = {
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  minutos: number;
};

export type Linea = { gastosCentimos: number; minutos: number; horasCentimos: number };

export type FilaMargen = {
  id: string;
  nombre: string;
  facturadoCentimos: number;
  gastosCentimos: number;
  minutos: number;
  horasCentimos: number;
  margenCentimos: number;
};

export type Rentabilidad = {
  porCliente: FilaMargen[];
  /** Con proyecto pero sin cliente. No se reparte. */
  sinCliente: Linea;
  porProyecto: FilaMargen[];
  /** Con cliente pero sin proyecto. No se reparte. */
  sinProyecto: Linea;
  /** Sin ningún contador. Una sola vez. */
  estructura: Linea;
  total: { facturadoCentimos: number; gastosCentimos: number; minutos: number; horasCentimos: number; margenCentimos: number };
};

/** Se redondea UNA vez, aquí, por fila: sumar redondeos parciales acumula error. */
export function costeDeMinutos(minutos: number, costeHoraCentimos: number): number {
  return Math.round((minutos * costeHoraCentimos) / 60);
}

type Acumulado = { nombre: string; facturado: number; gastos: number; minutos: number };

function fila(id: string, a: Acumulado, coste: number): FilaMargen {
  const horasCentimos = costeDeMinutos(a.minutos, coste);
  return {
    id,
    nombre: a.nombre,
    facturadoCentimos: a.facturado,
    gastosCentimos: a.gastos,
    minutos: a.minutos,
    horasCentimos,
    margenCentimos: a.facturado - a.gastos - horasCentimos,
  };
}

function linea(gastos: number, minutos: number, coste: number): Linea {
  return { gastosCentimos: gastos, minutos, horasCentimos: costeDeMinutos(minutos, coste) };
}

export function calcularMargen(e: {
  facturas: FacturaMes[];
  gastos: GastoMes[];
  tramos: TramoMes[];
  costeHoraCentimos: number;
}): Rentabilidad {
  const coste = e.costeHoraCentimos;
  const clientes = new Map<string, Acumulado>();
  const proyectos = new Map<string, Acumulado>();
  const toma = (m: Map<string, Acumulado>, id: string, nombre: string | null) => {
    const a = m.get(id) ?? { nombre: nombre ?? "Sin nombre", facturado: 0, gastos: 0, minutos: 0 };
    m.set(id, a);
    return a;
  };

  let sinClienteG = 0, sinClienteMin = 0;
  let sinProyectoG = 0, sinProyectoMin = 0;
  let estructuraG = 0, estructuraMin = 0;
  let facturadoTotal = 0, gastosTotal = 0, minutosTotal = 0;

  for (const f of e.facturas) {
    toma(clientes, f.clienteId, f.clienteNombre).facturado += f.baseCentimos;
    facturadoTotal += f.baseCentimos;
    // El proyecto vive en la LÍNEA (2A): una factura puede mezclar dos.
    for (const l of f.lineas) {
      if (l.proyectoId !== null) toma(proyectos, l.proyectoId, l.proyectoNombre).facturado += l.importeCentimos;
    }
  }

  for (const g of e.gastos) {
    gastosTotal += g.baseCentimos;
    if (g.clienteId !== null) toma(clientes, g.clienteId, g.clienteNombre).gastos += g.baseCentimos;
    else if (g.proyectoId !== null) sinClienteG += g.baseCentimos;
    else estructuraG += g.baseCentimos;
    if (g.proyectoId !== null) toma(proyectos, g.proyectoId, g.proyectoNombre).gastos += g.baseCentimos;
    else if (g.clienteId !== null) sinProyectoG += g.baseCentimos;
  }

  for (const t of e.tramos) {
    minutosTotal += t.minutos;
    if (t.clienteId !== null) toma(clientes, t.clienteId, t.clienteNombre).minutos += t.minutos;
    else if (t.proyectoId !== null) sinClienteMin += t.minutos;
    else estructuraMin += t.minutos;
    if (t.proyectoId !== null) toma(proyectos, t.proyectoId, t.proyectoNombre).minutos += t.minutos;
    else if (t.clienteId !== null) sinProyectoMin += t.minutos;
  }

  const ordenar = (m: Map<string, Acumulado>) =>
    [...m.entries()].map(([id, a]) => fila(id, a, coste)).sort((x, y) => y.margenCentimos - x.margenCentimos);

  // El total se calcula sobre los totales, no sumando filas: así el test de
  // cuadre comprueba de verdad que ningún eje pierde ni duplica nada.
  const horasTotal = costeDeMinutos(minutosTotal, coste);

  return {
    porCliente: ordenar(clientes),
    sinCliente: linea(sinClienteG, sinClienteMin, coste),
    porProyecto: ordenar(proyectos),
    sinProyecto: linea(sinProyectoG, sinProyectoMin, coste),
    estructura: linea(estructuraG, estructuraMin, coste),
    total: {
      facturadoCentimos: facturadoTotal,
      gastosCentimos: gastosTotal,
      minutos: minutosTotal,
      horasCentimos: horasTotal,
      margenCentimos: facturadoTotal - gastosTotal - horasTotal,
    },
  };
}
