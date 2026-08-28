// Cálculo de los objetivos diarios a partir de los datos de la persona.
//
// Es el módulo más delicado de la app: de aquí salen las calorías que la
// pantalla propone comer. Un error aquí no rompe nada visiblemente —sale un
// número, y los números siempre parecen correctos—, así que va entero en el
// dominio y con los suelos de seguridad probados uno a uno.

export type Sexo = 'hombre' | 'mujer' | 'sin_decir'

export type Actividad = 'sedentario' | 'ligera' | 'moderada' | 'alta' | 'muy_alta'

export type Objetivo =
  | 'perder_grasa'
  | 'ganar_musculo'
  | 'recomposicion'
  | 'mantener'
  | 'habitos'
  | 'rendimiento'

/**
 * Factores de actividad, descritos con ejemplos reales y no con jerga (§8.1).
 *
 * Sobreestiman con frecuencia, y el spec lo dice: esto es un punto de partida,
 * no una medida médica. La recalibración con datos reales llega en el bloque 4.
 */
export const ACTIVIDADES: { clave: Actividad; titulo: string; ejemplo: string; factor: number }[] = [
  { clave: 'sedentario', titulo: 'Sedentario', ejemplo: 'Trabajo sentado y poco más', factor: 1.2 },
  { clave: 'ligera', titulo: 'Ligera', ejemplo: 'Paseo la mayoría de días', factor: 1.375 },
  { clave: 'moderada', titulo: 'Moderada', ejemplo: 'Me muevo bastante o entreno 3 días', factor: 1.55 },
  { clave: 'alta', titulo: 'Alta', ejemplo: 'Trabajo de pie o entreno casi a diario', factor: 1.725 },
  { clave: 'muy_alta', titulo: 'Muy alta', ejemplo: 'Trabajo físico duro y además entreno', factor: 1.9 },
]

export const OBJETIVOS: { clave: Objetivo; titulo: string; ajuste: number }[] = [
  { clave: 'perder_grasa', titulo: 'Perder grasa', ajuste: -0.2 },
  { clave: 'ganar_musculo', titulo: 'Ganar músculo', ajuste: 0.1 },
  { clave: 'recomposicion', titulo: 'Recomposición', ajuste: 0 },
  { clave: 'mantener', titulo: 'Mantener', ajuste: 0 },
  { clave: 'habitos', titulo: 'Crear hábitos', ajuste: 0 },
  { clave: 'rendimiento', titulo: 'Rendimiento', ajuste: 0.05 },
]

/** Mínimos absolutos de calorías, por sexo. No son negociables (§8.2). */
export const MINIMO_KCAL = { hombre: 1500, mujer: 1200, sin_decir: 1200 } as const

/** Déficit máximo admitido sobre el gasto total. Tampoco es negociable. */
export const DEFICIT_MAXIMO = 0.25

/** Por qué se ha subido la propuesta. La pantalla lo explica, no lo esconde. */
export type MotivoSuelo = 'metabolismo_basal' | 'minimo_absoluto' | 'deficit_maximo'

export type Entrada = {
  edad: number
  /** Centímetros. */
  alturaCm: number
  /** Kilos. Sin peso no hay cálculo automático (§8.3). */
  pesoKg: number
  sexo: Sexo
  actividad: Actividad
  objetivo: Objetivo
}

export type Propuesta = {
  /** Metabolismo basal: lo que se gasta en reposo. */
  basal: number
  /** Gasto total: basal por el factor de actividad. */
  gasto: number
  kcal: number
  proteinaG: number
  carbosG: number
  grasasG: number
  aguaMl: number
  /**
   * Suelos que han tenido que aplicarse. Vacío significa que el cálculo salió
   * tal cual. La pantalla los enseña: subir el número sin decir por qué
   * convierte una medida de seguridad en lo que parece un error.
   */
  suelosAplicados: MotivoSuelo[]
  /** `true` si el sexo quedó sin responder y la estimación pierde precisión. */
  estimacionAproximada: boolean
  /**
   * `true` cuando se pidió perder grasa pero el mínimo de seguridad acaba por
   * encima del gasto estimado, así que la propuesta ya no es un déficit.
   *
   * Pasa de verdad: una persona menuda, mayor y sedentaria puede gastar 1.097
   * kcal al día, y el mínimo con el que se puede comer bien son 1.200. Bajar de
   * ahí no es una opción, así que la app propone 1.200 —y lo dice, en vez de
   * etiquetar un superávit como «perder grasa» y dejar a alguien esperando
   * un resultado que no va a llegar.
   */
  sinMargenParaDeficit: boolean
}

function factorDe(actividad: Actividad): number {
  return ACTIVIDADES.find((a) => a.clave === actividad)?.factor ?? 1.2
}

function ajusteDe(objetivo: Objetivo): number {
  return OBJETIVOS.find((o) => o.clave === objetivo)?.ajuste ?? 0
}

/**
 * Metabolismo basal por Mifflin-St Jeor.
 *
 * Sin sexo se usa el punto medio de las dos fórmulas, que solo se diferencian
 * en el término constante (+5 y −161). Es lo que pide el spec en vez de
 * suponer uno de los dos, y lo que obliga a advertir de la pérdida de
 * precisión.
 */
export function metabolismoBasal(
  entrada: Pick<Entrada, 'pesoKg' | 'alturaCm' | 'edad' | 'sexo'>,
): number {
  const comun = 10 * entrada.pesoKg + 6.25 * entrada.alturaCm - 5 * entrada.edad
  const constante =
    entrada.sexo === 'hombre' ? 5
    : entrada.sexo === 'mujer' ? -161
    : (5 + -161) / 2
  return Math.round(comun + constante)
}

/**
 * Los objetivos diarios, con los suelos de seguridad ya aplicados.
 *
 * El orden importa: primero se calcula lo que pide el objetivo, y solo después
 * se sube hasta el mayor de los suelos. Nunca por debajo del basal, nunca por
 * debajo del mínimo del sexo, y nunca un déficit mayor del 25% del gasto.
 */
export function calcularObjetivos(entrada: Entrada): Propuesta {
  const basal = metabolismoBasal(entrada)
  const gasto = Math.round(basal * factorDe(entrada.actividad))
  const propuestas = Math.round(gasto * (1 + ajusteDe(entrada.objetivo)))

  const suelos: { motivo: MotivoSuelo; valor: number }[] = [
    { motivo: 'metabolismo_basal', valor: basal },
    { motivo: 'minimo_absoluto', valor: MINIMO_KCAL[entrada.sexo] },
    { motivo: 'deficit_maximo', valor: Math.round(gasto * (1 - DEFICIT_MAXIMO)) },
  ]

  const suelosAplicados = suelos.filter((s) => propuestas < s.valor).map((s) => s.motivo)
  const kcal = Math.max(propuestas, ...suelos.map((s) => s.valor))
  const enDeficit = ajusteDe(entrada.objetivo) < 0

  // Proteína: 2,0 g/kg en déficit y 1,8 g/kg en el resto. Se mira el OBJETIVO y
  // no el resultado final: a quien los suelos le hayan subido las calorías
  // sigue queriendo perder grasa, y sigue necesitando la proteína alta.
  const proteinaG = Math.round(entrada.pesoKg * (enDeficit ? 2.0 : 1.8))

  // Grasas: 0,9 g/kg, pero nunca menos del 20% de las calorías. El mínimo
  // importa en personas ligeras, donde 0,9 g/kg se queda por debajo de lo que
  // hace falta para producir hormonas.
  const grasasPorPeso = entrada.pesoKg * 0.9
  const grasasMinimas = (kcal * 0.2) / 9
  const grasasG = Math.round(Math.max(grasasPorPeso, grasasMinimas))

  // Carbohidratos: lo que sobra. Nunca negativo —con calorías bajas y peso alto
  // la proteína y la grasa pueden comerse el total—, porque un objetivo de
  // carbos negativo no significa nada y rompería las barras del Home.
  const carbosG = Math.max(0, Math.round((kcal - proteinaG * 4 - grasasG * 9) / 4))

  return {
    basal,
    gasto,
    kcal,
    proteinaG,
    carbosG,
    grasasG,
    aguaMl: objetivoAgua(entrada.pesoKg),
    suelosAplicados,
    estimacionAproximada: entrada.sexo === 'sin_decir',
    sinMargenParaDeficit: enDeficit && kcal >= gasto,
  }
}

/**
 * Objetivo de agua: 35 ml por kilo, redondeado a los 100 ml.
 *
 * El spec no fija fórmula para el agua —solo para calorías y macros—, así que
 * se usa la recomendación habitual y se acota entre litro y medio y cuatro
 * litros: ni una persona muy ligera se queda en una cifra ridícula ni una muy
 * pesada acaba con un objetivo que nadie cumple.
 */
export function objetivoAgua(pesoKg: number): number {
  const bruto = pesoKg * 35
  const acotado = Math.min(4000, Math.max(1500, bruto))
  return Math.round(acotado / 100) * 100
}

/** La frase que explica un suelo. La pantalla enseña todas las que apliquen. */
export function explicarSuelo(motivo: MotivoSuelo): string {
  switch (motivo) {
    case 'metabolismo_basal':
      return 'Hemos subido las calorías: el cálculo quedaba por debajo de lo que tu cuerpo gasta en reposo.'
    case 'minimo_absoluto':
      return 'Hemos subido las calorías hasta el mínimo con el que se puede comer bien.'
    case 'deficit_maximo':
      return 'Hemos suavizado el déficit: bajar más rápido no acelera el resultado y cuesta mantenerlo.'
  }
}

/**
 * Lo que hay que decirle a quien pidió perder grasa y no tiene margen para un
 * déficit seguro. La pantalla lo enseña en vez de callarlo.
 */
export const AVISO_SIN_MARGEN =
  'Con estos datos, comer menos no sería seguro: tu mínimo saludable ya está en tu gasto estimado. ' +
  'Empieza por aquí y por moverte más; cuando la app tenga semanas de datos reales podrá afinarlo.'
