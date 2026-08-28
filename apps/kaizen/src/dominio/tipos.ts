export const MOMENTOS = [
  'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
] as const

export type Momento = (typeof MOMENTOS)[number]

export function esMomento(valor: string): valor is Momento {
  return (MOMENTOS as readonly string[]).includes(valor)
}
