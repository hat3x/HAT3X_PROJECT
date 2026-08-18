// Lógica pura del peso: leerlo, formatearlo y compararlo. Vive aquí y no en las
// pantallas para poder probarla sin montar React ni simular AsyncStorage —
// importarla desde una pantalla arrastra el cliente de Supabase entero.

// Límites de cordura, no médicos: atajan el dedo gordo —un 7 de más convierte
// 78 en 780— antes de que ensucie el histórico y deforme la gráfica de meses.
export const KG_MINIMO = 20
export const KG_MAXIMO = 400

/**
 * Acepta «78,4» y «78.4». La coma es lo que sale del teclado numérico en
 * español y `Number('78,4')` es `NaN`, así que sin esto la mitad de los
 * intentos fallarían sin motivo aparente.
 */
export function leerKg(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (limpio === '') return null
  const kg = Number(limpio)
  if (!Number.isFinite(kg)) return null
  if (kg < KG_MINIMO || kg > KG_MAXIMO) return null
  return kg
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «18 ago» a partir de «2026-08-18». Sin `Intl`: su soporte en Hermes es irregular. */
export function fechaCorta(fechaLocal: string): string {
  const [, mes, dia] = fechaLocal.split('-')
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? mes}`
}

/** Un decimal y coma española, como el resto de la app. */
export function enKg(kg: number): string {
  return kg.toFixed(1).replace('.', ',')
}

/**
 * Diferencia con la pesada anterior, formateada y con su signo.
 *
 * Devuelve `null` para la primera de todas: escribir «+0,0» en la más antigua
 * sugiere que se comparó con algo, y no hay nada con qué comparar.
 */
export function variacion(actual: number, anterior: number | undefined): string | null {
  if (anterior === undefined) return null
  const diferencia = actual - anterior
  // `toFixed` ya redondea, así que -0,04 sale «-0,0»: se normaliza a «0,0» sin
  // signo para no anunciar una bajada que en realidad no existe.
  const texto = enKg(Math.abs(diferencia))
  if (texto === '0,0') return '0,0'
  return `${diferencia > 0 ? '+' : '−'}${texto}`
}
