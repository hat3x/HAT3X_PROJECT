// Captura pantallas de la app servida en web y avisa de errores de consola.
//
// Existe porque el bloque 0 se dio por bueno con 65 pruebas en verde y aun asi
// llego al movil con iconos en blanco y contenido debajo de la barra de estado.
// Ninguna prueba mira la pantalla. Esto la mira.
//
// Uso:
//   node scripts/captura.mjs                    -> todas las rutas
//   node scripts/captura.mjs /ajustes /coach    -> solo esas
//   KAIZEN_SESION=no node scripts/captura.mjs   -> sin sesion simulada
//
// En Git Bash los argumentos que empiezan por "/" se convierten en rutas de
// Windows. Usa MSYS_NO_PATHCONV=1 delante del comando si pasas rutas.
//
// El servidor tiene que estar levantado:  npx expo start --web --port 8099

import { chromium } from 'playwright'
import { mkdir, rm, readFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.KAIZEN_WEB ?? 'http://localhost:8099'
const SALIDA = path.resolve('capturas')
const CON_SESION = process.env.KAIZEN_SESION !== 'no'

// Pixel 9: 1080x2424 fisicos, 2,625 de densidad. Redondeamos a un viewport
// realista y pedimos el doble de pixeles para poder leer el texto pequeno.
const MOVIL = { width: 412, height: 915 }
const DENSIDAD = 2

const RUTAS_POR_DEFECTO = [
  '/',
  '/nutricion',
  '/entrenamiento',
  '/evolucion',
  '/coach',
  '/anadir',
  '/anadir-hueco',
  '/registrar-peso',
  '/registrar-entrenamiento',
  '/entrada-rapida',
  '/buscar-alimento',
  '/ajustes',
  '/borrar-cuenta',
  '/acceso',
]

const nombreDe = (ruta) => (ruta === '/' ? 'inicio' : ruta.replace(/^\//, '').replace(/\//g, '-'))

// El usuario de mentira de las capturas. Mismo `id` que el `sub` del token de
// mas abajo, y todos los campos con valor: la consulta del perfil usa
// `.single()`, asi que un hueco aqui se convierte en un control en blanco en
// Ajustes que parece un fallo de la app sin serlo.
const USUARIO_DE_EJEMPLO = '00000000-0000-4000-8000-000000000001'
const PERFIL_DE_EJEMPLO = {
  id: USUARIO_DE_EJEMPLO,
  nombre: 'Jota',
  unidades: 'metrico',
  zona_horaria: 'Europe/Madrid',
  corte_dia: 4,
  hora_silencio: 22,
  // El tema sale del perfil, no del sistema, asi que para ver la piel clara hay
  // que pedirla aqui:  KAIZEN_TEMA=claro npm run capturas
  tema: process.env.KAIZEN_TEMA ?? 'defecto',
}

/** Lee el .env sin traerse una dependencia solo para esto. */
async function leerEnv() {
  const texto = await readFile('.env', 'utf8').catch(() => '')
  const pares = {}
  for (const linea of texto.split(/\r?\n/)) {
    const par = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (par) pares[par[1]] = par[2].trim().replace(/^["']|["']$/g, '')
  }
  return pares
}

const base64url = (objeto) =>
  Buffer.from(JSON.stringify(objeto)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Sesion falsa escrita directamente en el almacen que lee supabase-js.
 *
 * En web, AsyncStorage es `window.localStorage` con la clave tal cual, y
 * supabase-js guarda la sesion bajo `sb-<ref>-auth-token`. El token no esta
 * firmado con nada valido: sirve para que la app se crea que hay sesion y
 * pinte las pantallas, no para hablar con el servidor. Por eso ademas
 * cortamos todo el trafico hacia Supabase mas abajo.
 */
function sesionSimulada(url) {
  const ref = new URL(url).hostname.split('.')[0]
  const usuario = '00000000-0000-4000-8000-000000000001'
  const caduca = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  const token = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      sub: usuario,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'capturas@kaizen.local',
      exp: caduca,
      iat: Math.floor(Date.now() / 1000),
    }),
    'firma-no-valida-solo-para-capturas',
  ].join('.')

  return {
    clave: `sb-${ref}-auth-token`,
    valor: JSON.stringify({
      access_token: token,
      refresh_token: 'refresco-no-valido',
      token_type: 'bearer',
      expires_in: 60 * 60 * 24 * 365,
      expires_at: caduca,
      user: {
        id: usuario,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'capturas@kaizen.local',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
    }),
  }
}

// Lo que responde cada tabla. Con datos, no vacio: una pantalla con ceros no
// distingue «funciona y hoy no has bebido» de «no lee nada», que es justo el
// error que hay que poder ver aqui.
const RESPUESTAS = {
  // `.single()` espera objeto, no lista.
  perfiles: PERFIL_DE_EJEMPLO,
  registros_agua: [{ ml: 250 }, { ml: 500 }, { ml: 250 }],
  // `.maybeSingle()` con `.limit(1)`: tambien objeto.
  // Completa, como en la base real (todas esas columnas son `not null`).
  // Devolviendo solo `agua_ml`, el Home pintaba «1.167 / NaN».
  objetivos: { agua_ml: 2500, kcal: 2300, proteina_g: 170, carbos_g: 220, grasas_g: 70 },
  // De mas nuevo a mas viejo, como los pide la consulta.
  pesos: [
    { fecha_local: '2026-08-18', kg: 78.4 },
    { fecha_local: '2026-08-17', kg: 78.8 },
    { fecha_local: '2026-08-15', kg: 79.1 },
    { fecha_local: '2026-08-12', kg: 79.1 },
    { fecha_local: '2026-08-09', kg: 80.3 },
  ],
  entrenamientos: [
    { id: 'e1', fecha_local: '2026-08-18', tipo: 'fuerza', duracion_min: 75 },
    { id: 'e2', fecha_local: '2026-08-17', tipo: 'cardio', duracion_min: 35 },
    { id: 'e3', fecha_local: '2026-08-16', tipo: 'movilidad', duracion_min: null },
  ],
  comida_items: [
    { id: 'c1', nombre: 'Avena con platano', cantidad_g: 80, kcal: 310, proteina_g: 10.4, carbos_g: 52, grasas_g: 5.6, comidas: { momento: 'desayuno', fecha_local: '2026-08-18' } },
    { id: 'c2', nombre: 'Cafe con leche', cantidad_g: 200, kcal: 90, proteina_g: 6.6, carbos_g: 9.4, grasas_g: 3.2, comidas: { momento: 'desayuno', fecha_local: '2026-08-18' } },
    { id: 'c3', nombre: 'Pechuga de pollo', cantidad_g: 180, kcal: 297, proteina_g: 55.8, carbos_g: 0, grasas_g: 6.5, comidas: { momento: 'comida', fecha_local: '2026-08-18' } },
    { id: 'c4', nombre: 'Arroz blanco', cantidad_g: 250, kcal: 325, proteina_g: 6.8, carbos_g: 70, grasas_g: 0.8, comidas: { momento: 'comida', fecha_local: '2026-08-18' } },
    { id: 'c5', nombre: 'Yogur griego', cantidad_g: 150, kcal: 145, proteina_g: 13.5, carbos_g: 5.4, grasas_g: 7.5, comidas: { momento: 'snack', fecha_local: '2026-08-18' } },
  ],
}

const rutas = process.argv.slice(2).length > 0 ? process.argv.slice(2) : RUTAS_POR_DEFECTO
const env = await leerEnv()
const urlSupabase = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL

if (CON_SESION && !urlSupabase) {
  console.error('Falta EXPO_PUBLIC_SUPABASE_URL (en .env o en el entorno).')
  process.exit(1)
}

await rm(SALIDA, { recursive: true, force: true })
await mkdir(SALIDA, { recursive: true })

// Usamos el Chrome del sistema en vez del Chromium que trae Playwright: son
// unos 150 MB que no hace falta bajar, y en esta maquina el disco va justo.
const navegador = await chromium.launch({ channel: 'chrome' })
const contexto = await navegador.newContext({
  viewport: MOVIL,
  deviceScaleFactor: DENSIDAD,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
})

if (CON_SESION) {
  const { clave, valor } = sesionSimulada(urlSupabase)
  await contexto.addInitScript(
    ([c, v]) => window.localStorage.setItem(c, v),
    [clave, valor],
  )

  // Cinturon: la base de datos de este proyecto es la de produccion. Ninguna
  // captura debe poder leerla ni, mucho menos, escribirla.
  //
  // Y lo que se devuelve tiene que ser CREIBLE, no vacio. Devolviendo `[]` a
  // todo, `.single()` del perfil se traga el array, `perfil.zona_horaria` sale
  // `undefined` y Ajustes se pinta con el campo en blanco y sin nada
  // seleccionado. Eso no es un fallo de la app: es el arnes fabricandolo. Un
  // arnes que inventa fallos es peor que no tenerlo.
  const anfitrion = new URL(urlSupabase).hostname
  await contexto.route(`**://${anfitrion}/**`, (ruta) => {
    const url = ruta.request().url()
    const tabla = Object.keys(RESPUESTAS).find((t) => url.includes(`/rest/v1/${t}`))
    const cuerpo = tabla ? JSON.stringify(RESPUESTAS[tabla]) : '[]'
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: cuerpo })
  })
}

const informe = []

for (const ruta of rutas) {
  const pagina = await contexto.newPage()
  const problemas = []

  pagina.on('console', (mensaje) => {
    if (mensaje.type() === 'error') problemas.push(`consola: ${mensaje.text()}`)
  })
  pagina.on('pageerror', (error) => problemas.push(`excepcion: ${error.message}`))

  const ficheros = []
  try {
    await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 120_000 })
    // Metro tarda en el primer paquete y las fuentes de iconos cargan aparte.
    await pagina.waitForTimeout(2_500)

    // Dos vistas de cada pantalla: lo que cabe en el movil (donde se ven los
    // recortes y lo que tapa la barra) y la pantalla entera desplegada.
    const visible = path.join(SALIDA, `${nombreDe(ruta)}.png`)
    await pagina.screenshot({ path: visible })
    ficheros.push(visible)

    const alto = await pagina.evaluate(() => document.documentElement.scrollHeight)
    if (alto > MOVIL.height + 40) {
      const completa = path.join(SALIDA, `${nombreDe(ruta)}-completa.png`)
      await pagina.screenshot({ path: completa, fullPage: true })
      ficheros.push(completa)
    }
  } catch (error) {
    problemas.push(`navegacion: ${error.message}`)
  }

  informe.push({ ruta, ficheros, problemas })
  await pagina.close()
}

await navegador.close()

for (const { ruta, ficheros, problemas } of informe) {
  console.log(`\n${ruta}`)
  console.log(`  ${ficheros.length > 0 ? ficheros.map((f) => path.basename(f)).join(' + ') : 'NO SE PUDO'}`)
  if (problemas.length === 0) {
    console.log('  sin errores de consola')
  } else {
    for (const problema of [...new Set(problemas)].slice(0, 8)) console.log(`  ! ${problema}`)
  }
}

const rotas = informe.filter((r) => r.ficheros.length === 0).length
console.log(`\n${informe.length - rotas}/${informe.length} rutas capturadas en ${SALIDA}`)
console.log(CON_SESION ? 'con sesion simulada, sin tocar Supabase' : 'sin sesion')
process.exit(rotas > 0 ? 1 : 0)
