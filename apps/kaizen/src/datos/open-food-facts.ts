import { traducirResultados, traducirProducto, type AlimentoEncontrado, type ProductoOFF } from '@/dominio/open-food-facts'

const BASE = 'https://world.openfoodfacts.org'

/**
 * Open Food Facts pide que las aplicaciones se identifiquen, y bloquea a las
 * que no lo hacen. No es cortesía: es su condición de uso.
 */
const IDENTIFICACION = 'Kaizen/1.0 (https://hat3x.com)'

/**
 * Solo los campos que usamos. Sin esto la respuesta trae la ficha completa de
 * cada producto —ingredientes, etiquetas, fotos, ecoscore— y son cientos de
 * kilobytes por búsqueda, en el móvil y con datos.
 */
const CAMPOS = 'code,product_name,product_name_es,generic_name,brands,nutriments'

/** Suficientes para elegir sin tener que desplazarse mucho. */
const CUANTOS = 20

/** Cortamos nosotros antes de que lo haga el sistema: la red móvil se cuelga. */
const ESPERA_MAXIMA_MS = 10_000

/**
 * Lo que se le enseña a quien busca cuando Open Food Facts nos frena. Su límite
 * ronda las diez búsquedas por minuto y no avisa con un 429 honrado: devuelve
 * una página HTML de error con un 200. Comprobado llamando: la misma consulta
 * que funciona a la primera falla al repetirla seguida.
 */
export const MENSAJE_DEMASIADAS_BUSQUEDAS =
  'Demasiadas búsquedas seguidas. Espera unos segundos y vuelve a intentarlo.'

export const MENSAJE_SIN_CONEXION =
  'No hemos podido conectar con el buscador de alimentos. Revisa tu conexión.'

async function pedirJson(url: string, senal?: AbortSignal): Promise<unknown> {
  // Se combina el aborto de quien llama —al teclear otra letra— con el nuestro
  // por tiempo. Sin el segundo, una petición encallada deja la pantalla
  // girando para siempre.
  const porTiempo = new AbortController()
  const temporizador = setTimeout(() => porTiempo.abort(), ESPERA_MAXIMA_MS)
  const alAbortar = () => porTiempo.abort()
  senal?.addEventListener('abort', alAbortar)

  try {
    const respuesta = await fetch(url, {
      signal: porTiempo.signal,
      headers: { 'User-Agent': IDENTIFICACION, Accept: 'application/json' },
    })

    if (respuesta.status === 429) throw new Error(MENSAJE_DEMASIADAS_BUSQUEDAS)
    if (!respuesta.ok) throw new Error(MENSAJE_SIN_CONEXION)

    // El texto primero y el JSON después, a mano: cuando frenan, contestan una
    // página HTML con un 200, y `respuesta.json()` reventaría con «Unexpected
    // token '<'», que no le dice nada a nadie.
    const texto = await respuesta.text()
    try {
      return JSON.parse(texto)
    } catch {
      throw new Error(MENSAJE_DEMASIADAS_BUSQUEDAS)
    }
  } finally {
    clearTimeout(temporizador)
    senal?.removeEventListener('abort', alAbortar)
  }
}

/**
 * Busca por texto.
 *
 * Va por `cgi/search.pl` y no por `/api/v2/search`, que es el moderno, porque
 * el v2 no ordena por relevancia: exige un `sort_by`, y con `popularity_key`
 * buscar «yogur griego» devuelve avena y guacamole. Comprobado llamando a los
 * dos. El filtro de país no es solo para afinar: sin él, este endpoint también
 * responde con la página de error.
 */
export async function buscarAlimentos(texto: string, senal?: AbortSignal): Promise<AlimentoEncontrado[]> {
  const consulta = texto.trim()
  if (consulta === '') return []

  const url =
    `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(consulta)}` +
    `&search_simple=1&action=process&json=1&page_size=${CUANTOS}&fields=${CAMPOS}` +
    `&tagtype_0=countries&tag_contains_0=contains&tag_0=spain`

  const datos = (await pedirJson(url, senal)) as { products?: ProductoOFF[] }
  return traducirResultados(datos.products ?? [])
}

/**
 * Busca por código de barras. `null` si no existe o si su ficha no sirve —que
 * pasa: hay productos registrados sin datos nutricionales.
 *
 * Este sí va por el v2, que para un producto concreto funciona bien y no
 * depende de ninguna ordenación.
 */
export async function alimentoPorCodigo(codigo: string, senal?: AbortSignal): Promise<AlimentoEncontrado | null> {
  const limpio = codigo.trim()
  if (limpio === '') return null

  const url = `${BASE}/api/v2/product/${encodeURIComponent(limpio)}?fields=${CAMPOS}`
  const datos = (await pedirJson(url, senal)) as { status?: number; product?: ProductoOFF }
  if (datos.status === 0 || !datos.product) return null
  return traducirProducto(datos.product)
}
