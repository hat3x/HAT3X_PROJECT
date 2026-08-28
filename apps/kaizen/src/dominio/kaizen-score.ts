// El índice de adherencia del día. Lógica pura, como manda la regla dura del
// spec: nada que pueda estar mal en silencio —calorías, macros, score, fechas—
// se prueba montando una pantalla.

/**
 * Los cinco componentes y su peso, según §9.2 del spec.
 *
 * Los pesos NO suman sobre el total: suman sobre los componentes *activos*. Si
 * hoy no tocaba entrenar, sus 20 puntos se reparten entre los demás en vez de
 * restarse. Un día sin entrenamiento programado no puede tener un techo de 80.
 */
export const PESOS = {
  calorias: 30,
  proteina: 25,
  hidratacion: 15,
  entrenamiento: 20,
  habitos: 10,
} as const

export type ClaveComponente = keyof typeof PESOS

/** Ancho de la banda de calorías: ±8% del objetivo. */
export const BANDA_CALORIAS = 0.08

/**
 * A qué distancia del objetivo el componente de calorías vale cero.
 *
 * Medida en fracción del objetivo, contada desde el borde de la banda. Con 0,5
 * y un objetivo de 2.000 kcal: 2.160 es el borde y 3.160 el cero, decayendo en
 * línea recta entre medias. No hay ciencia detrás del número; hay que elegir
 * uno, y este hace que pasarse mucho duela sin que pasarse un poco arruine el
 * día.
 */
export const TOLERANCIA_CALORIAS = 0.5

export type EntradaScore = {
  kcal: number
  kcalObjetivo: number
  proteinaG: number
  proteinaObjetivoG: number
  aguaMl: number
  aguaObjetivoMl: number
  /** Cuántos entrenamientos se han registrado hoy. */
  entrenamientos: number
  /**
   * Si hoy tocaba entrenar. Mientras no exista la planificación (bloque 5) no
   * hay forma de saberlo, así que se pasa `false` y el componente solo cuenta
   * cuando de hecho se ha entrenado: puede sumar, nunca restar. Suponer que
   * tocaba y penalizar por no hacerlo sería inventarse una obligación.
   */
  tocabaEntrenar: boolean
  /** Hábitos configurados y cuántos van marcados. Cero configurados = inactivo. */
  habitos: number
  habitosHechos: number
  /**
   * `true` mientras el día está en curso.
   *
   * Cambia cómo puntúan las calorías, y es la diferencia entre una app que
   * acompaña y una que insulta: a las nueve de la mañana no has comido nada, y
   * una nota honesta diría 13/100. Durante el día el componente mide progreso
   * hacia la banda; al cerrarlo pasa a medir si acabaste dentro.
   */
  diaEnCurso: boolean
}

export type Componente = {
  clave: ClaveComponente
  /** De 0 a 1. */
  logro: number
  peso: number
}

export type ResultadoScore = {
  /** De 0 a 100, entero. */
  score: number
  componentes: Componente[]
}

/** Recorta a [0, 1]. Un `NaN` cae a 0 en vez de contagiar el resultado. */
function acotar(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.min(1, Math.max(0, valor))
}

/**
 * Proporción simple hasta el objetivo. Pasarse no penaliza ni suma.
 *
 * Es lo correcto para proteína e hidratación: beber tres litros en vez de dos y
 * medio no es peor que beber dos y medio, solo no es más.
 */
export function puntuarProporcional(actual: number, objetivo: number): number {
  if (objetivo <= 0) return 0
  return acotar(actual / objetivo)
}

/**
 * El componente de calorías, que es el único con forma propia.
 *
 * **Comer 900 kcal no es un día perfecto.** Premia estar en rango, no comer
 * poco: una app que puntúa mejor cuanto menos comes empuja justo al
 * comportamiento que este producto quiere evitar (§9.3 del spec).
 *
 * Con el día en curso, quedarse corto no penaliza —todavía queda día por
 * delante—: cuenta como progreso hacia la banda. Pasarse sí penaliza desde el
 * primer momento, porque eso ya no lo arregla el resto de la tarde.
 */
export function puntuarCalorias(kcal: number, objetivo: number, diaEnCurso: boolean): number {
  if (objetivo <= 0) return 0

  const suelo = objetivo * (1 - BANDA_CALORIAS)
  const techo = objetivo * (1 + BANDA_CALORIAS)

  if (kcal > techo) {
    const exceso = (kcal - techo) / objetivo
    return acotar(1 - exceso / TOLERANCIA_CALORIAS)
  }

  if (kcal >= suelo) return 1

  if (diaEnCurso) return acotar(kcal / suelo)

  const defecto = (suelo - kcal) / objetivo
  return acotar(1 - defecto / TOLERANCIA_CALORIAS)
}

/**
 * El score del día, normalizado siempre sobre los componentes activos.
 *
 * Un componente está activo cuando tiene sentido puntuarlo: la hidratación solo
 * si hay objetivo de agua, el entrenamiento solo si tocaba o si se entrenó, los
 * hábitos solo si hay alguno configurado.
 */
export function kaizenScore(entrada: EntradaScore): ResultadoScore {
  const componentes: Componente[] = []

  if (entrada.kcalObjetivo > 0) {
    componentes.push({
      clave: 'calorias',
      peso: PESOS.calorias,
      logro: puntuarCalorias(entrada.kcal, entrada.kcalObjetivo, entrada.diaEnCurso),
    })
  }

  if (entrada.proteinaObjetivoG > 0) {
    componentes.push({
      clave: 'proteina',
      peso: PESOS.proteina,
      logro: puntuarProporcional(entrada.proteinaG, entrada.proteinaObjetivoG),
    })
  }

  if (entrada.aguaObjetivoMl > 0) {
    componentes.push({
      clave: 'hidratacion',
      peso: PESOS.hidratacion,
      logro: puntuarProporcional(entrada.aguaMl, entrada.aguaObjetivoMl),
    })
  }

  // Entra si tocaba —y entonces puede quedar a cero— o si se entrenó sin que
  // tocara, y entonces suma. Lo que no puede es restar por algo que nadie
  // programó.
  if (entrada.tocabaEntrenar || entrada.entrenamientos > 0) {
    componentes.push({
      clave: 'entrenamiento',
      peso: PESOS.entrenamiento,
      logro: entrada.entrenamientos > 0 ? 1 : 0,
    })
  }

  if (entrada.habitos > 0) {
    componentes.push({
      clave: 'habitos',
      peso: PESOS.habitos,
      logro: puntuarProporcional(entrada.habitosHechos, entrada.habitos),
    })
  }

  const pesoTotal = componentes.reduce((suma, c) => suma + c.peso, 0)
  if (pesoTotal === 0) return { score: 0, componentes }

  const ponderado = componentes.reduce((suma, c) => suma + c.logro * c.peso, 0)
  return { score: Math.round((ponderado / pesoTotal) * 100), componentes }
}

/**
 * La frase que acompaña al anillo.
 *
 * Nunca regaña. Un número bajo a media mañana solo significa que queda día por
 * delante, y quien mira la app a las once de la noche con un 30 ya sabe que el
 * día no ha ido bien: no necesita que se lo diga la pantalla.
 */
export function mensajeScore(score: number, diaEnCurso: boolean): string {
  if (diaEnCurso) {
    if (score >= 85) return 'Día redondo. Sigue así.'
    if (score >= 60) return 'Vas por muy buen camino.'
    if (score >= 30) return 'Vas arrancando. Queda día por delante.'
    return 'El día acaba de empezar.'
  }
  if (score >= 85) return 'Gran día.'
  if (score >= 60) return 'Buen día.'
  if (score >= 30) return 'Día flojo. Mañana se retoma.'
  return 'Día en blanco. Pasa.'
}

export type PasoMision = { clave: string; texto: string; hecho: boolean }

/**
 * «Tu misión de hoy»: lo que queda por hacer, derivado de lo registrado.
 *
 * Era una lista fija de maqueta que decía lo mismo pasara lo que pasara. Ahora
 * cada línea se marca sola conforme avanza el día, que es lo que dice el spec
 * (§10.1): se completa sola, sin medallas ni confeti.
 *
 * Los momentos de comida van primero y en orden del día, porque son lo que uno
 * olvida registrar. Se omiten los que ya no tocan: preguntar por la cena a las
 * diez de la mañana no ayuda a nadie, pero eso necesita saber la hora y llega
 * con las ventanas de momento del bloque 3. De momento salen los tres.
 */
export function mision(estado: {
  momentosRegistrados: readonly string[]
  proteinaG: number
  proteinaObjetivoG: number
  aguaMl: number
  aguaObjetivoMl: number
  entrenamientos: number
}): PasoMision[] {
  const pasos: PasoMision[] = [
    { clave: 'desayuno', texto: 'Registrar el desayuno', hecho: estado.momentosRegistrados.includes('desayuno') },
    { clave: 'comida', texto: 'Registrar la comida', hecho: estado.momentosRegistrados.includes('comida') },
    { clave: 'cena', texto: 'Registrar la cena', hecho: estado.momentosRegistrados.includes('cena') },
  ]

  if (estado.proteinaObjetivoG > 0) {
    pasos.push({
      clave: 'proteina',
      texto: `Llegar a ${Math.round(estado.proteinaObjetivoG)} g de proteína`,
      hecho: estado.proteinaG >= estado.proteinaObjetivoG,
    })
  }

  if (estado.aguaObjetivoMl > 0) {
    // En litros con un decimal, igual que la tarjeta del Home: la misión no
    // puede hablar de mililitros mientras la tarjeta de al lado dice litros.
    const litros = (Math.round(estado.aguaObjetivoMl / 100) / 10).toFixed(1).replace('.', ',')
    pasos.push({
      clave: 'agua',
      texto: `Beber ${litros} L de agua`,
      hecho: estado.aguaMl >= estado.aguaObjetivoMl,
    })
  }

  pasos.push({
    clave: 'entrenamiento',
    texto: 'Entrenar',
    hecho: estado.entrenamientos > 0,
  })

  return pasos
}
