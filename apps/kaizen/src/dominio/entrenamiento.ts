// Lógica pura del entrenamiento. Igual que `peso.ts`: aquí y no en la pantalla,
// para poder probarla sin montar React ni arrastrar el cliente de Supabase.

/**
 * Los tipos que se pueden registrar.
 *
 * La columna `tipo` de la base es `text` libre, no un enum: la lista vive aquí
 * porque es una decisión de producto —qué ofrecemos— y no una restricción de
 * datos. Añadir uno no necesita migración.
 */
export const TIPOS_ENTRENAMIENTO = [
  { clave: 'fuerza', titulo: 'Fuerza' },
  { clave: 'cardio', titulo: 'Cardio' },
  { clave: 'movilidad', titulo: 'Movilidad' },
  { clave: 'otro', titulo: 'Otro' },
] as const

export type TipoEntrenamiento = (typeof TIPOS_ENTRENAMIENTO)[number]['clave']

export function tituloDeTipo(clave: string): string {
  return TIPOS_ENTRENAMIENTO.find((t) => t.clave === clave)?.titulo ?? clave
}

// Cotas de cordura, no de diseño: cinco minutos es lo mínimo que merece
// llamarse sesión, y ocho horas ya es un error de tecleo, no un entrenamiento.
export const MINUTOS_MINIMO = 5
export const MINUTOS_MAXIMO = 480

/** Devuelve `null` si lo escrito no son minutos creíbles. */
export function leerMinutos(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return null
  const minutos = Number(limpio)
  if (!Number.isInteger(minutos)) return null
  if (minutos < MINUTOS_MINIMO || minutos > MINUTOS_MAXIMO) return null
  return minutos
}

/**
 * «1 h 15 min», «45 min», «2 h». No se escribe «1 h 0 min»: los minutos a cero
 * sobran y solo alargan la línea.
 */
export function enDuracion(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${resto} min`
  if (resto === 0) return `${horas} h`
  return `${horas} h ${resto} min`
}

/**
 * Qué pone la tarjeta de entrenamiento del Home. Tres estados y no dos:
 * mientras se carga no se puede decir «Pendiente hoy», porque afirma algo que
 * todavía no se sabe y parpadea a otra cosa medio segundo después.
 */
export function resumenEntrenamiento(
  cargando: boolean,
  deHoy: { tipo: string; duracion_min: number | null }[],
): string {
  if (cargando) return 'Cargando…'
  const ultima = deHoy[0]
  if (ultima === undefined) return 'Pendiente hoy'
  // Se describe la última —la más reciente viene primera— y se cuenta el resto:
  // listarlas todas desbordaría la tarjeta en cuanto haya tres.
  const titulo = tituloDeTipo(ultima.tipo)
  const conDuracion = ultima.duracion_min ? `${titulo} · ${enDuracion(ultima.duracion_min)}` : titulo
  return deHoy.length === 1 ? conDuracion : `${conDuracion} · +${deHoy.length - 1} más`
}
