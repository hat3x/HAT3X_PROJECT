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

async function crearHabito(cliente: SupabaseClient, userId: string, nombre: string) {
  const id = crypto.randomUUID()
  const { error } = await cliente.from('habitos').upsert(
    { id, user_id: userId, nombre, orden: 0 }, { onConflict: 'id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
  return id
}

/** La misma escritura que hace `alternar`: upsert por (habito_id, fecha_local). */
async function marcar(
  cliente: SupabaseClient, userId: string, habitoId: string, fecha: string, hecho: boolean,
) {
  const { error } = await cliente.from('habitos_registro').upsert(
    { id: crypto.randomUUID(), user_id: userId, habito_id: habitoId, fecha_local: fecha, hecho },
    { onConflict: 'habito_id,fecha_local' },
  )
  if (error) throw new Error(error.message)
}

it('marcar y desmarcar el mismo dia corrige la fila, no la duplica', async () => {
  const yo = await usuarioNuevo('hab-alternar')
  const habito = await crearHabito(yo.cliente, yo.id, 'Creatina')
  const HOY = '2026-08-18'

  await marcar(yo.cliente, yo.id, habito, HOY, true)
  await marcar(yo.cliente, yo.id, habito, HOY, false)
  await marcar(yo.cliente, yo.id, habito, HOY, true)

  const { data } = await yo.cliente
    .from('habitos_registro').select('hecho').eq('fecha_local', HOY)
  expect(data).toHaveLength(1)
  expect(data![0]!.hecho).toBe(true)
})

it('cada dia lleva su propia marca', async () => {
  const yo = await usuarioNuevo('hab-dias')
  const habito = await crearHabito(yo.cliente, yo.id, 'Estirar')

  await marcar(yo.cliente, yo.id, habito, '2026-08-17', true)
  await marcar(yo.cliente, yo.id, habito, '2026-08-18', false)

  const { data } = await yo.cliente
    .from('habitos_registro').select('fecha_local, hecho').order('fecha_local')
  expect(data).toHaveLength(2)
  expect(data!.map((f) => f.hecho)).toEqual([true, false])
})

// Se marca `activo: false` en vez de borrar precisamente por esto: la cascada
// se llevaria por delante el historico de haberlo cumplido.
it('desactivar conserva el historico; borrar se lo llevaria', async () => {
  const yo = await usuarioNuevo('hab-desactivar')
  const habito = await crearHabito(yo.cliente, yo.id, 'Pasear')
  await marcar(yo.cliente, yo.id, habito, '2026-08-17', true)

  await yo.cliente.from('habitos').update({ activo: false }).eq('id', habito)

  const { data: registros } = await yo.cliente.from('habitos_registro').select('hecho')
  expect(registros).toHaveLength(1)

  // Y la lista del Home, que filtra por activos, ya no lo trae.
  const { data: activos } = await yo.cliente.from('habitos').select('id').eq('activo', true)
  expect(activos).toHaveLength(0)

  // Comprobado de verdad: borrarlo si se lleva el registro.
  await yo.cliente.from('habitos').delete().eq('id', habito)
  const { data: despues } = await yo.cliente.from('habitos_registro').select('hecho')
  expect(despues).toHaveLength(0)
})

it('los habitos de otra persona no se cuelan', async () => {
  const yo = await usuarioNuevo('hab-yo')
  const otro = await usuarioNuevo('hab-otro')
  await crearHabito(yo.cliente, yo.id, 'Lo mio')
  await crearHabito(otro.cliente, otro.id, 'Lo suyo')

  const { data } = await yo.cliente.from('habitos').select('nombre')
  expect(data).toHaveLength(1)
  expect(data![0]!.nombre).toBe('Lo mio')
})
