import type { ImageSourcePropType } from 'react-native'

export type Recuadro = { arriba: number; izquierda: number; abajo: number; derecha: number }

export type Fondo =
  | { tipo: 'color'; valor: string }
  | { tipo: 'degradado'; desde: string; hasta: string }
  | { tipo: 'recurso'; fuente: ImageSourcePropType; recuadro: Recuadro | null }

/**
 * Una tarjeta cuyo marco es arte, con zonas ya dibujadas dentro.
 *
 * El arte de esta clase no es un marco vacío: trae ilustraciones fijas a los
 * lados —una gota, el edificio de Capsule Corp, una bola de dragón— y a veces
 * botones enteros con su texto. El contenido de la app tiene que caer en el
 * hueco que queda, y los botones dibujados necesitan que alguien escuche el
 * toque encima de ellos.
 *
 * Todo va en fracción del ancho (0 a 1) y no en píxeles, porque la misma
 * imagen se estira a cualquier pantalla.
 */
export type TarjetaIlustrada = {
  fondo: Fondo
  /** Dónde empieza y acaba la zona vacía utilizable. */
  contenido: { izquierda: number; derecha: number }
  /** Botones ya pintados en el arte, en el orden en que actúan. */
  pulsables: { desde: number; hasta: number }[]
}

export type RecetaBarra = 'continua' | 'segmentada'
/**
 * `segmentado` es el medidor de la piel personal: 32 tramos con relleno
 * parcial del ultimo, sobre un marco de arte. Sus medidas vienen dadas por el
 * PNG del marco, asi que no se pueden inventar.
 */
export type RecetaAnillo = 'liso' | 'medidor' | 'segmentado'

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

  /**
   * Arte por pieza. Todo opcional: `null` en las pieles que no lo usan, y
   * entonces la pantalla cae al `superficie.tarjeta` genérico.
   *
   * Las tarjetas van como `Fondo` y no como imagen suelta para poder llevar su
   * `recuadro` (nine-patch): así una sola imagen de 750 px sirve para cualquier
   * ancho de pantalla sin deformar las esquinas ni el marco.
   *
   * Los botones van como imagen suelta porque su arte trae el texto YA pintado
   * dentro —«Registrar», «+250»—, así que quien los use no debe escribir
   * encima. Es la diferencia entre un fondo de botón y un botón entero.
   */
  decoracion: {
    cabecera: Fondo | null
    /** El aro de arte que rodea al medidor. Solo lo usa la receta `segmentado`. */
    anilloMarco: ImageSourcePropType | null
    tarjetaNutricion: TarjetaIlustrada | null
    tarjetaAgua: TarjetaIlustrada | null
    tarjetaEntrenamiento: TarjetaIlustrada | null
    tarjetaMision: TarjetaIlustrada | null
    barraCalorias: ImageSourcePropType | null
    botonRegistrar: ImageSourcePropType | null
    botonAgua250: ImageSourcePropType | null
    botonAgua500: ImageSourcePropType | null
    botonMas: ImageSourcePropType | null
    iconoProteina: ImageSourcePropType | null
    iconoCarbos: ImageSourcePropType | null
    iconoGrasas: ImageSourcePropType | null
    iconoAgua: ImageSourcePropType | null
  }
}
