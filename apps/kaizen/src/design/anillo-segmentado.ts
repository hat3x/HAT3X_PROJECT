// Geometría del medidor segmentado de la piel personal.
//
// Los números NO son elegibles: salen del PNG del marco (1254x1254), que ya
// trae dibujados los huecos donde encajan los tramos. Cambiar cualquiera
// descuadra el relleno respecto al arte.

export const LADO = 1254
export const CENTRO = 627
export const RADIO_INTERIOR = 438
export const RADIO_EXTERIOR = 505

/** Treinta y dos tramos: ocho por cuadrante, 3,125 puntos cada uno. */
export const TRAMOS = 32
export const PUNTOS_POR_TRAMO = 100 / TRAMOS
const PASO = 360 / TRAMOS
/** Separación entre tramos, en grados. */
const HUECO = 2.25

const acotar = (valor: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, valor))

function polar(radio: number, grados: number) {
  const radianes = ((grados - 90) * Math.PI) / 180
  return { x: CENTRO + radio * Math.cos(radianes), y: CENTRO + radio * Math.sin(radianes) }
}

/** El trazado de un tramo: arco exterior, hacia dentro, arco interior, cerrar. */
export function trazadoDeTramo(desde: number, hasta: number): string {
  const fueraIni = polar(RADIO_EXTERIOR, desde)
  const fueraFin = polar(RADIO_EXTERIOR, hasta)
  const dentroFin = polar(RADIO_INTERIOR, hasta)
  const dentroIni = polar(RADIO_INTERIOR, desde)
  const arcoLargo = hasta - desde > 180 ? 1 : 0
  return [
    `M ${fueraIni.x} ${fueraIni.y}`,
    `A ${RADIO_EXTERIOR} ${RADIO_EXTERIOR} 0 ${arcoLargo} 1 ${fueraFin.x} ${fueraFin.y}`,
    `L ${dentroFin.x} ${dentroFin.y}`,
    `A ${RADIO_INTERIOR} ${RADIO_INTERIOR} 0 ${arcoLargo} 0 ${dentroIni.x} ${dentroIni.y}`,
    'Z',
  ].join(' ')
}

export type Tramo = { apagado: string; encendido: string | null }

/**
 * Los 32 tramos para una puntuación dada, cada uno con su parte encendida.
 *
 * El último tramo se rellena en proporción en vez de encenderse entero: sin
 * eso, el medidor avanzaría a saltos de 3,125 puntos y un registro de agua no
 * movería nada visible.
 */
export function tramosPara(puntuacion: number): Tramo[] {
  const valor = acotar(puntuacion, 0, 100)
  return Array.from({ length: TRAMOS }, (_, indice) => {
    const desde = indice * PASO + HUECO / 2
    const hasta = (indice + 1) * PASO - HUECO / 2
    const relleno = acotar((valor - indice * PUNTOS_POR_TRAMO) / PUNTOS_POR_TRAMO, 0, 1)
    return {
      apagado: trazadoDeTramo(desde, hasta),
      encendido: relleno > 0 ? trazadoDeTramo(desde, desde + (hasta - desde) * relleno) : null,
    }
  })
}
