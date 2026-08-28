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

/** La misma escritura que hace `usarObjetivos`: upsert por (user_id, vigente_desde). */
async function fijar(cliente: SupabaseClient, userId: string, desde: string, kcal: number) {
  const { error } = await cliente.from('objetivos').upsert({
    id: crypto.randomUUID(), user_id: userId, vigente_desde: desde,
    kcal, proteina_g: 160, carbos_g: 200, grasas_g: 72, agua_ml: 2800,
    objetivo: 'perder_grasa', origen: 'auto',
  }, { onConflict: 'user_id,vigente_desde' })
  if (error) throw new Error(error.message)
}

/** La misma lectura: el mas reciente. */
async function vigente(cliente: SupabaseClient) {
  const { data, error } = await cliente
    .from('objetivos').select('vigente_desde, kcal')
    .order('vigente_desde', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

it('recalcular el mismo dia corrige la fila en vez de dejar dos vigentes', async () => {
  const yo = await usuarioNuevo('obj-mismo-dia')
  await fijar(yo.cliente, yo.id, '2026-08-18', 2300)
  await fijar(yo.cliente, yo.id, '2026-08-18', 2100)

  const { data } = await yo.cliente.from('objetivos').select('kcal')
  expect(data).toHaveLength(1)
  expect(Number(data![0]!.kcal)).toBe(2100)
})

it('recalcular otro dia deja el historico y pasa a valer el nuevo', async () => {
  const yo = await usuarioNuevo('obj-historico')
  await fijar(yo.cliente, yo.id, '2026-07-01', 2500)
  await fijar(yo.cliente, yo.id, '2026-08-18', 2100)

  // Las dos filas siguen ahi: es lo que permitira ver con que objetivos se
  // vivio cada mes. Pero la vigente es la ultima.
  const { data } = await yo.cliente.from('objetivos').select('kcal')
  expect(data).toHaveLength(2)
  expect(Number((await vigente(yo.cliente))!.kcal)).toBe(2100)
})

it('sin ninguna fila, la consulta devuelve nulo y no revienta', async () => {
  const yo = await usuarioNuevo('obj-vacio')
  expect(await vigente(yo.cliente)).toBeNull()
})

it('los objetivos de otra persona no se leen como tuyos', async () => {
  const yo = await usuarioNuevo('obj-yo')
  const otro = await usuarioNuevo('obj-otro')
  await fijar(otro.cliente, otro.id, '2026-08-18', 3500)

  // Sin RLS, este `maybeSingle()` traeria los 3500 de otra persona y la app
  // propondria comer segun el cuerpo de un desconocido.
  expect(await vigente(yo.cliente)).toBeNull()
})
