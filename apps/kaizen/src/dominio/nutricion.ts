// Lógica pura de la nutrición: convertir «por 100 g» en «lo que me he comido»,
// leer lo que se teclea y sumar el día. Aquí y no en las pantallas, para poder
// probarla sin React ni Supabase.

/**
 * Los momentos del día. `momento` es `text` libre en la base, no un enum: la
 * lista es decisión de producto y añadir uno no necesita migración.
 */
export const MOMENTOS = [
  { clave: 'desayuno', titulo: 'Desayuno' },
  { clave: 'comida', titulo: 'Comida' },
  { clave: 'cena', titulo: 'Cena' },
  { clave: 'snack', titulo: 'Snack' },
] as const

export type Momento = (typeof MOMENTOS)[number]['clave']

export function tituloDeMomento(clave: string): string {
  return MOMENTOS.find((m) => m.clave === clave)?.titulo ?? clave
}

/** Valores nutricionales por 100 g, que es como vienen en cualquier etiqueta. */
export type Por100 = {
  kcal_100: number
  proteina_100: number
  carbos_100: number
  grasas_100: number
}

/** Lo que aporta de verdad una cantidad concreta. */
export type Macros = {
  kcal: number
  proteina_g: number
  carbos_g: number
  grasas_g: number
}

export const MACROS_CERO: Macros = { kcal: 0, proteina_g: 0, carbos_g: 0, grasas_g: 0 }

/**
 * Regla de tres entre los valores por 100 g y los gramos comidos.
 *
 * Se redondea a un decimal, no a entero: 30 g de aceite son 4,5 g de carbos que
 * a entero se convierten en 4 o en 5, y ese error repetido cinco veces al día
 * desplaza el total lo bastante como para notarse. Y se redondea AQUÍ, al
 * guardar, no al mostrar: lo que se ve tiene que ser exactamente lo que se
 * sumó, o los macros de la tarjeta no cuadrarán con los de sus renglones.
 */
export function porCantidad(por100: Por100, gramos: number): Macros {
  const factor = gramos / 100
  const redondear = (valor: number) => Math.round(valor * factor * 10) / 10
  return {
    kcal: Math.round(por100.kcal_100 * factor),
    proteina_g: redondear(por100.proteina_100),
    carbos_g: redondear(por100.carbos_100),
    grasas_g: redondear(por100.grasas_100),
  }
}

/** Suma de todo lo comido. Las kcal van enteras; los macros, a un decimal. */
export function sumarMacros(items: Macros[]): Macros {
  const total = items.reduce(
    (acumulado, item) => ({
      kcal: acumulado.kcal + item.kcal,
      proteina_g: acumulado.proteina_g + item.proteina_g,
      carbos_g: acumulado.carbos_g + item.carbos_g,
      grasas_g: acumulado.grasas_g + item.grasas_g,
    }),
    MACROS_CERO,
  )
  // Sumar decimales en coma flotante deja restos: 0,1 + 0,2 son 0,30000000000004.
  // Sin esta pasada, la tarjeta enseñaría eso tal cual.
  return {
    kcal: Math.round(total.kcal),
    proteina_g: Math.round(total.proteina_g * 10) / 10,
    carbos_g: Math.round(total.carbos_g * 10) / 10,
    grasas_g: Math.round(total.grasas_g * 10) / 10,
  }
}

// Un plato de 3 kg no existe; 0 g tampoco es haber comido algo.
export const GRAMOS_MINIMO = 1
export const GRAMOS_MAXIMO = 3000

/** Devuelve `null` si lo escrito no son gramos creíbles. Acepta coma y punto. */
export function leerGramos(texto: string): number | null {
  const gramos = leerNumero(texto)
  if (gramos === null) return null
  if (gramos < GRAMOS_MINIMO || gramos > GRAMOS_MAXIMO) return null
  return gramos
}

/**
 * Un número positivo escrito a mano, con coma o con punto. Devuelve `null` si
 * no lo es. El vacío es `null` y no cero: «no lo he dicho» no es «es cero».
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (limpio === '') return null
  const valor = Number(limpio)
  if (!Number.isFinite(valor) || valor < 0) return null
  return valor
}

/** Entero con separador de miles a la española, como en el Home. */
export function enKcal(kcal: number): string {
  return Math.round(kcal).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Gramos de macro para la pantalla: sin decimal cuando es redondo, con coma
 * cuando no. «132 g» y «4,5 g»; nunca «132,0 g», que solo alarga la línea.
 */
export function enGramos(gramos: number): string {
  const redondeado = Math.round(gramos * 10) / 10
  return Number.isInteger(redondeado)
    ? String(redondeado)
    : redondeado.toFixed(1).replace('.', ',')
}

/**
 * Un número utilizable, o el valor por defecto. Nunca `NaN`.
 *
 * `Number(undefined)` es `NaN`, y un `NaN` que llega a la pantalla sale como
 * «1.167 / NaN» y contagia la barra de progreso. Visto en una captura.
 */
export function numeroOPorDefecto(valor: unknown, porDefecto: number): number {
  // `null` y la cadena vacía se descartan ANTES de convertir, porque
  // `Number(null)` es 0 y `Number('')` también: los dos son finitos y pasarían
  // el filtro. Un objetivo de 0 kcal dejaría la barra llena y «0 restantes»
  // para siempre, que es peor que no tener objetivo. Ausencia no es cero.
  if (valor === null || valor === undefined || valor === '') return porDefecto
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : porDefecto
}
