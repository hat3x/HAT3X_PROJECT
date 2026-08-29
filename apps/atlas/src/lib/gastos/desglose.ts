//
// En qué se va el dinero, por tres caminos a la vez.
//
// Lógica pura: sin base, sin red, sin reloj. Entra lo que se gastó en un
// periodo y salen tres agrupaciones del MISMO dinero —por plataforma, por
// cliente y por proyecto— más el total.
//
// Que sean tres del mismo dinero no es una comodidad de la pantalla: es la
// comprobación. Si por plataforma sale una cifra distinta que por cliente, hay
// un gasto perdiéndose en alguna agrupación, y eso no se ve mirando la
// pantalla. Por eso hay un test que exige que los tres sumen igual.
//

export type GastoAgrupable = {
  /** Céntimos enteros. Ningún float toca un importe. */
  totalCentimos: number;
  plataformaId: string | null;
  plataformaNombre: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
};

export type Fila = {
  /** Nulo cuando el gasto no tenía ese eje asignado. */
  id: string | null;
  nombre: string;
  centimos: number;
};

export type Desglose = {
  total: number;
  porPlataforma: Fila[];
  porCliente: Fila[];
  porProyecto: Fila[];
};

/**
 * Lo que no tiene ese eje asignado NO se descarta: se junta bajo este nombre.
 * Descartarlo haría que los tres desgloses dejaran de sumar el total, y nadie
 * sabría por qué falta dinero.
 */
const SIN_ASIGNAR = "Sin asignar";

function agrupar(
  gastos: GastoAgrupable[],
  id: (g: GastoAgrupable) => string | null,
  nombre: (g: GastoAgrupable) => string | null
): Fila[] {
  const porClave = new Map<string, Fila>();

  for (const g of gastos) {
    const suId = id(g);
    // La clave es cadena y no el id a secas porque el id puede ser nulo, y así
    // todos los gastos sin asignar caen en el mismo cubo.
    const clave = suId ?? "";
    const fila = porClave.get(clave);
    if (fila) {
      fila.centimos += g.totalCentimos;
    } else {
      porClave.set(clave, {
        id: suId,
        nombre: nombre(g) ?? SIN_ASIGNAR,
        centimos: g.totalCentimos,
      });
    }
  }

  // De mayor a menor: lo que se viene a mirar es en qué se va el dinero, y eso
  // lo responde la primera fila, no leer la lista entera.
  return [...porClave.values()].sort((a, b) => b.centimos - a.centimos);
}

export function desglosar(gastos: GastoAgrupable[]): Desglose {
  return {
    total: gastos.reduce((t, g) => t + g.totalCentimos, 0),
    porPlataforma: agrupar(
      gastos,
      (g) => g.plataformaId,
      (g) => g.plataformaNombre
    ),
    porCliente: agrupar(
      gastos,
      (g) => g.clienteId,
      (g) => g.clienteNombre
    ),
    porProyecto: agrupar(
      gastos,
      (g) => g.proyectoId,
      (g) => g.proyectoNombre
    ),
  };
}
