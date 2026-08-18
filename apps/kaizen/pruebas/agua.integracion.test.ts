import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

const CONTRASENA = 'contrasena-de-prueba'

async function usuarioNuevo(etiqueta: string) {
  const admin = createClient(URL, SERVICIO)
  const correo = `${etiqueta}-${Date.now()}-${Math.round(Math.random() * 1e6)}@prueba.local`
  const { data } = await admin.auth.admin.createUser({
    email: correo, password: CONTRASENA, email_confirm: true,
  })
  const cliente = createClient(URL, ANON)
  await cliente.auth.signInWithPassword({ email: correo, password: CONTRASENA })
  return { id: data.user!.id, cliente }
}

/** El mismo par de operaciones que hace `usarAgua`: escribir un vaso y sumar el día. */
const vaso = (userId: string, fecha: string, ml: number) => ({
  id: crypto.randomUUID(), user_id: userId, fecha_local: fecha, ml,
})

// El cliente va sin tipar a proposito: `createClient` sin tipos generados
// devuelve un generico cuyos parametros no encajan consigo mismo entre
// llamadas, y aqui lo unico que importa es que responda a `.from()`.
async function totalDelDia(cliente: SupabaseClient, fecha: string) {
  const { data, error } = await cliente.from('registros_agua').select('ml').eq('fecha_local', fecha)
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, fila) => total + (fila as { ml: number }).ml, 0)
}

it('los vasos del día se suman, y ni los de ayer ni los de otra persona entran en la cuenta', async () => {
  const yo = await usuarioNuevo('agua-yo')
  const otro = await usuarioNuevo('agua-otro')

  const HOY = '2026-08-18'
  const AYER = '2026-08-17'

  await yo.cliente.from('registros_agua').insert([
    vaso(yo.id, HOY, 250),
    vaso(yo.id, HOY, 500),
    // El de ayer existe y no debe contarse: es justo el fallo que tendría un
    // `select` sin filtrar por fecha, y que en la app se vería como empezar el
    // día con el agua de la noche anterior ya puesta.
    vaso(yo.id, AYER, 1000),
  ])

  // Y el de otra persona tampoco, aunque sea del mismo día: aquí quien filtra
  // no es el `eq` sino RLS, y esta es la comprobación de que sigue puesta.
  await otro.cliente.from('registros_agua').insert([vaso(otro.id, HOY, 750)])

  expect(await totalDelDia(yo.cliente, HOY)).toBe(750)
  expect(await totalDelDia(otro.cliente, HOY)).toBe(750)
  expect(await totalDelDia(yo.cliente, AYER)).toBe(1000)
})
