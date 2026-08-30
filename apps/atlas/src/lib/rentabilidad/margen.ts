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

/**
 * Un cajón «sin repartir». Lleva `facturadoCentimos` porque el cajón
 * «con cliente pero sin proyecto» SÍ factura: una línea de factura sin
 * proyecto (2A: el proyecto vive en la línea) es ingreso de ese cajón, y
 * tenerlo en un campo aparte de `Rentabilidad` obligaba a la pantalla a
 * pintar dos filas para el mismo cajón. En `sinCliente` y `estructura` es
 * siempre 0: una factura tiene cliente por esquema, así que nada sin
 * cliente puede facturar.
 */
export type Linea = { facturadoCentimos: number; gastosCentimos: number; minutos: number; horasCentimos: number };

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
  /**
   * Con cliente pero sin proyecto. No se reparte. Su `facturadoCentimos` es
   * la suma de las líneas de factura sin proyecto: sin él la tabla por
   * proyecto no cuadraba a la vista con el total.
   */
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

function linea(facturado: number, gastos: number, minutos: number, coste: number): Linea {
  return { facturadoCentimos: facturado, gastosCentimos: gastos, minutos, horasCentimos: costeDeMinutos(minutos, coste) };
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
  let facturadoSinProyecto = 0;

  for (const f of e.facturas) {
    toma(clientes, f.clienteId, f.clienteNombre).facturado += f.baseCentimos;
    facturadoTotal += f.baseCentimos;
    // El proyecto vive en la LÍNEA (2A): una factura puede mezclar dos.
    for (const l of f.lineas) {
      if (l.proyectoId !== null) toma(proyectos, l.proyectoId, l.proyectoNombre).facturado += l.importeCentimos;
      else facturadoSinProyecto += l.importeCentimos;
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

  const filasCliente = ordenar(clientes);
  const filasProyecto = ordenar(proyectos);
  // Solo `sinProyecto` factura (ver `Linea`); las otras dos van a 0.
  const lineaSinCliente = linea(0, sinClienteG, sinClienteMin, coste);
  const lineaSinProyecto = linea(facturadoSinProyecto, sinProyectoG, sinProyectoMin, coste);
  const lineaEstructura = linea(0, estructuraG, estructuraMin, coste);

  // Ronda de arreglo 1: el total de horas se SUMA a partir de las filas ya
  // redondeadas del eje de cliente (porCliente + sinCliente + estructura); no
  // se redondea aparte sobre el total de minutos. Con coste no exacto y
  // minutos que no son múltiplos de 60 los dos números difieren: con coste
  // 3333 y dos clientes de 1 minuto cada uno, las filas dan 56 + 56 = 112
  // pero redondear el total de minutos (2) da 111. La pantalla enseña las
  // filas y el total juntos, y un total que no cuadra con lo que se ve
  // encima parece un error de verdad aunque no lo sea.
  //
  // El eje de proyectos cuadra con el mismo número por construcción, no por
  // coincidencia: son las mismas líneas (tramos) las que alimentan
  // porProyecto + sinProyecto + estructura, solo agrupadas por otra clave.
  // Mientras los tramos de un cliente no se repartan entre varios proyectos
  // (ni un proyecto entre varios clientes) de forma que un eje junte lo que
  // el otro separa, cada grupo del eje de cliente tiene un grupo espejo en
  // el de proyecto con exactamente los mismos minutos, y el mismo redondeo
  // por grupo da la misma suma en los dos ejes.
  const horasTotal =
    filasCliente.reduce((t, f) => t + f.horasCentimos, 0) +
    lineaSinCliente.horasCentimos +
    lineaEstructura.horasCentimos;

  return {
    porCliente: filasCliente,
    sinCliente: lineaSinCliente,
    porProyecto: filasProyecto,
    sinProyecto: lineaSinProyecto,
    estructura: lineaEstructura,
    total: {
      facturadoCentimos: facturadoTotal,
      gastosCentimos: gastosTotal,
      minutos: minutosTotal,
      horasCentimos: horasTotal,
      margenCentimos: facturadoTotal - gastosTotal - horasTotal,
    },
  };
}
