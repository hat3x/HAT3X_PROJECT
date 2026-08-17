import type { ImageSourcePropType } from 'react-native'

export type Recuadro = { arriba: number; izquierda: number; abajo: number; derecha: number }

export type Fondo =
  | { tipo: 'color'; valor: string }
  | { tipo: 'degradado'; desde: string; hasta: string }
  | { tipo: 'recurso'; fuente: ImageSourcePropType; recuadro: Recuadro | null }

export type RecetaBarra = 'continua' | 'segmentada'
export type RecetaAnillo = 'liso' | 'medidor'

export interface Tema {
  nombre: string
  esquema: 'claro' | 'oscuro'

  color: {
    acento: string
    sobreAcento: string
    texto: string
    textoTenue: string
    borde: string
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

  fondo: { pantalla: Fondo; velo: string }

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
