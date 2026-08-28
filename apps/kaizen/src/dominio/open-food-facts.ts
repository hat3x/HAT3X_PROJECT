import { numeroOPorDefecto, type Por100 } from './nutricion'

/**
 * Un alimento tal y como lo usa la app, ya traducido desde Open Food Facts.
 *
 * `codigo` es el de barras: sirve para reconocerlo al escanear y para no
 * guardar dos veces el mismo producto en el catálogo propio.
 */
export type AlimentoEncontrado = Por100 & {
  codigo: string
  nombre: string
  marca: string | null
}

/** Lo que devuelve Open Food Facts, con todo opcional porque de verdad lo es. */
export type ProductoOFF = {
  code?: string
  product_name?: string
  product_name_es?: string
  generic_name?: string
  brands?: string
  nutriments?: Record<string, unknown>
}

// Un kilojulio son 0,239 kcal. Muchos productos europeos solo traen kJ.
const KCAL_POR_KJ = 1 / 4.184

/**
 * Traduce un producto de Open Food Facts al alimento que entiende la app.
 *
 * Devuelve `null` cuando no sirve para registrar, y eso pasa mucho: la base es
 * colaborativa y hay fichas sin nombre o sin energía. Enseñarlas daría
 * resultados que al tocarlos suman cero calorías, que es peor que no verlas.
 */
export function traducirProducto(producto: ProductoOFF): AlimentoEncontrado | null {
  const codigo = (producto.code ?? '').trim()
  if (codigo === '') return null

  // El nombre en español primero: la ficha global suele venir en inglés o en
  // francés aunque el producto se venda aquí.
  const nombre = (producto.product_name_es || producto.product_name || producto.generic_name || '').trim()
  if (nombre === '') return null

  const kcal = energiaEnKcal(producto.nutriments ?? {})
  if (kcal === null) return null

  const n = producto.nutriments ?? {}
  return {
    codigo,
    nombre,
    // `brands` viene como lista separada por comas; con la primera basta.
    marca: primeraMarca(producto.brands),
    kcal_100: Math.round(kcal),
    proteina_100: numeroOPorDefecto(n['proteins_100g'], 0),
    carbos_100: numeroOPorDefecto(n['carbohydrates_100g'], 0),
    grasas_100: numeroOPorDefecto(n['fat_100g'], 0),
  }
}

/**
 * Las kcal por 100 g, vengan como vengan.
 *
 * Se prefiere el campo en kcal; si solo hay kilojulios se convierten. Devuelve
 * `null` si no hay ninguno de los dos: un alimento sin energía no se puede
 * registrar, y ponerle cero mentiría en el total del día.
 */
export function energiaEnKcal(nutrientes: Record<string, unknown>): number | null {
  const enKcal = Number(nutrientes['energy-kcal_100g'])
  if (Number.isFinite(enKcal) && enKcal > 0) return enKcal

  const enKj = Number(nutrientes['energy-kj_100g'] ?? nutrientes['energy_100g'])
  if (Number.isFinite(enKj) && enKj > 0) return enKj * KCAL_POR_KJ

  return null
}

/** «Hacendado,Mercadona» → «Hacendado». Cadena vacía o ausente → `null`. */
export function primeraMarca(marcas: string | undefined): string | null {
  const primera = (marcas ?? '').split(',')[0]?.trim() ?? ''
  return primera === '' ? null : primera
}

/**
 * Traduce la respuesta entera y descarta lo que no sirve, sin repetir códigos.
 *
 * Open Food Facts devuelve duplicados con cierta frecuencia —la misma ficha
 * indexada dos veces—, y verlos repetidos en la lista da sensación de error.
 */
export function traducirResultados(productos: ProductoOFF[]): AlimentoEncontrado[] {
  const vistos = new Set<string>()
  const alimentos: AlimentoEncontrado[] = []
  for (const producto of productos) {
    const alimento = traducirProducto(producto)
    if (alimento === null || vistos.has(alimento.codigo)) continue
    vistos.add(alimento.codigo)
    alimentos.push(alimento)
  }
  return alimentos
}
