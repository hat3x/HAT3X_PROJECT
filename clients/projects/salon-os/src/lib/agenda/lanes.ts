/**
 * Reparto en carriles (columnas horizontales dentro de un mismo día) de citas
 * que se solapan en el tiempo — para la vista Semana, donde un solo carril por
 * día mezcla a TODOS los profesionales y las citas simultáneas se pisaban unas
 * a otras (recortando las tarjetas). Función pura de geometría de intervalos:
 * sin fechas, sin React, sin IO. Complemento HORIZONTAL de la línea de tiempo
 * elástica de `timeline.ts` (que resuelve el eje VERTICAL).
 *
 * Minutos = enteros desde medianoche local (la zona la resuelve el llamador).
 */

export interface LaneInput {
  /** Minuto de inicio (incluido). */
  startMin: number;
  /** Minuto de fin (excluido). `endMin === startMin` de otra NO es solape. */
  endMin: number;
}

export interface LanePlacement {
  /** Índice de carril, 0-based, dentro del grupo de solape. */
  lane: number;
  /** Nº total de carriles del grupo → ancho de la tarjeta = 1 / lanes. */
  lanes: number;
}

/**
 * Asigna a cada intervalo un carril y el nº de carriles de su grupo de solape.
 *
 * Algoritmo (coloreo voraz por borde izquierdo sobre un grafo de intervalos,
 * que es perfecto → nº de carriles = solape máximo del grupo):
 *  1. Se recorre por orden de inicio (y a igualdad, por fin).
 *  2. Un intervalo entra en el grupo actual si empieza antes de que acabe el
 *     grupo (solape encadenado); si no, se cierra el grupo y arranca otro.
 *  3. Dentro del grupo se coloca en el primer carril libre (cuyo último fin
 *     <= inicio del intervalo); si no hay ninguno, se abre un carril nuevo.
 *  4. Al cerrar el grupo, todos sus intervalos reciben `lanes` = nº de carriles.
 *
 * Devuelve un array PARALELO a `items` (mismo índice ↔ mismo elemento), aunque
 * la entrada no venga ordenada por hora.
 */
export function layoutLanes(items: readonly LaneInput[]): LanePlacement[] {
  const result: LanePlacement[] = items.map(() => ({ lane: 0, lanes: 1 }));
  if (items.length === 0) return result;

  const order = items
    .map((_, index) => index)
    .sort((a, b) => {
      const ia = items[a];
      const ib = items[b];
      if (ia === undefined || ib === undefined) return 0;
      return ia.startMin - ib.startMin || ia.endMin - ib.endMin;
    });

  // Estado del grupo de solape en curso.
  let groupMemberIndices: number[] = [];
  let groupEndMax = Number.NEGATIVE_INFINITY; // fin máximo visto en el grupo
  let laneEnds: number[] = []; // fin del último intervalo colocado en cada carril

  const closeGroup = (): void => {
    const laneCount = Math.max(laneEnds.length, 1);
    for (const memberIndex of groupMemberIndices) {
      const placement = result[memberIndex];
      if (placement !== undefined) placement.lanes = laneCount;
    }
    groupMemberIndices = [];
    laneEnds = [];
    groupEndMax = Number.NEGATIVE_INFINITY;
  };

  for (const index of order) {
    const item = items[index];
    if (item === undefined) continue;

    // Nuevo grupo si este intervalo no solapa con NINGUNO del grupo actual.
    // Como el grupo está encadenado y se recorre por inicio, basta comparar
    // con el fin máximo del grupo: inicio >= finMáx ⇒ sin solape.
    if (groupMemberIndices.length > 0 && item.startMin >= groupEndMax) {
      closeGroup();
    }

    // Primer carril libre (su último fin no invade el inicio de este intervalo).
    let chosenLane = -1;
    for (let laneIndex = 0; laneIndex < laneEnds.length; laneIndex += 1) {
      const laneEnd = laneEnds[laneIndex];
      if (laneEnd !== undefined && laneEnd <= item.startMin) {
        chosenLane = laneIndex;
        break;
      }
    }
    if (chosenLane === -1) {
      chosenLane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[chosenLane] = item.endMin;
    }

    const placement = result[index];
    if (placement !== undefined) placement.lane = chosenLane;
    groupMemberIndices.push(index);
    groupEndMax = Math.max(groupEndMax, item.endMin);
  }

  closeGroup();
  return result;
}
