import type { ImageSourcePropType } from 'react-native'

export type Recuadro = { arriba: number; izquierda: number; abajo: number; derecha: number }

export type Fondo =
  | { tipo: 'color'; valor: string }
  | { tipo: 'degradado'; desde: string; hasta: string }
  | { tipo: 'recurso'; fuente: ImageSourcePropType; recuadro: Recuadro | null }

export type RecetaBarra = 'continua' | 'segmentada'
export type RecetaAnillo = 'liso' | 'medidor'

/**
 * Una mancha de color difusa del fondo. Varias juntas forman la «aurora».
 *
 * El cristal no se ve sobre un fondo plano: desenfocar un negro liso da un gris
 * liso. Lo que hace que una superficie parezca vidrio es que detrás haya
 * variación de color y de luz que la superficie recoge. Estas manchas son esa
 * variación, y por eso viven en el tema y no en una pantalla: cada piel decide
 * las suyas, y una piel con fondo ilustrado las deja en `[]`.
 *
 * `x`, `y` y `radio` van en fracción del lado (0 a 1), no en píxeles, para que
 * la misma aurora valga en cualquier tamaño de pantalla.
 */
export type Mancha = {
  color: string
  x: number
  y: number
  radio: number
  opacidad: number
}

export interface Tema {
  nombre: string
  esquema: 'claro' | 'oscuro'

  color: {
    acento: string
    sobreAcento: string
    texto: string
    textoTenue: string
    borde: string
    // El filo de luz del borde superior de una superficie de cristal. Es lo
    // que separa «rectángulo translúcido» de «vidrio»: el ojo lee el canto
    // iluminado como grosor. Va aparte de `borde` porque son cosas distintas
    // —uno delimita, el otro simula un canto— y una piel ilustrada querrá
    // apagarlo (transparente) sin perder el borde.
    especular: string
    pista: string
    // Sin esto, la primera pantalla que muestre un error escribe un rojo a
    // mano y la regla del sistema de temas se rompe en su primer uso real.
    peligro: string
    sobrePeligro: string
    proteina: string
    carbos: string
    grasas: string
  }

  radio: { tarjeta: number; boton: number; pastilla: number }

  espaciado: readonly [number, number, number, number, number, number, number, number, number]

  tipografia: {
    familiaTitular: string | null
    familiaCuerpo: string | null
    pesoTitular: '600' | '700' | '800'
    pesoCuerpo: '400' | '500' | '600'
    ajusteLinea: number
    mayusculasEtiquetas: boolean
  }

  // `aurora` es una lista y no un campo opcional a propósito: el test de
  // contrato exige que todos los temas declaren las mismas claves, y trata los
  // arrays como una hoja. Así una piel sin aurora pone `[]` y sigue cumpliendo.
  fondo: { pantalla: Fondo; velo: string; aurora: Mancha[] }

  superficie: {
    tarjeta: Fondo
    barraInferior: Fondo
    // El botón necesita `Fondo`, no solo un color: un skin con arte de botón
    // ilustrado no cabe en `color.acento`, y sin esto la pantalla acabaría
    // decidiendo a pelo entre imagen y color plano.
    botonPrimario: Fondo
    botonSecundario: Fondo
    // La Tarea 10 construye el borrado de cuenta y necesita un botón
    // destructivo; sin este campo lo escribiría a mano igual que el error.
    botonPeligro: Fondo
    desenfoque: number
  }

  recetas: { barra: RecetaBarra; anillo: RecetaAnillo }

  decoracion: {
    cabecera: ImageSourcePropType | null
    tarjetaEntrenamiento: ImageSourcePropType | null
    tarjetaMision: ImageSourcePropType | null
  }
}
