import { createClient, SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function crearUsuario(correo: string): Promise<{ cliente: SupabaseClient; id: string }> {
  const admin = createClient(URL, SERVICIO)
  const { data, error } = await admin.auth.admin.createUser({
    email: correo, password: 'contrasena-de-prueba', email_confirm: true,
  })
  if (error) throw error
  const cliente = createClient(URL, ANON)
  await cliente.auth.signInWithPassword({ email: correo, password: 'contrasena-de-prueba' })
  return { cliente, id: data.user!.id }
}

describe('aislamiento entre usuarios', () => {
  let a: Awaited<ReturnType<typeof crearUsuario>>
  let b: Awaited<ReturnType<typeof crearUsuario>>

  beforeAll(async () => {
    a = await crearUsuario(`a-${Date.now()}@prueba.local`)
    b = await crearUsuario(`b-${Date.now()}@prueba.local`)
    const { error } = await a.cliente.from('pesos').insert({
      id: crypto.randomUUID(), user_id: a.id, fecha_local: '2026-08-17', kg: 80,
    })
    expect(error).toBeNull()
  })

  it('B no puede leer los pesos de A', async () => {
    const { data } = await b.cliente.from('pesos').select('*')
    expect(data).toEqual([])
  })

  it('B no puede modificar los pesos de A', async () => {
    const { data } = await b.cliente.from('pesos').update({ kg: 99 }).eq('user_id', a.id).select()
    expect(data).toEqual([])
  })

  it('B no puede borrar los pesos de A', async () => {
    await b.cliente.from('pesos').delete().eq('user_id', a.id)
    const { data } = await a.cliente.from('pesos').select('*')
    expect(data).toHaveLength(1)
  })

  it('B no puede insertar un registro a nombre de A', async () => {
    const { error } = await b.cliente.from('pesos').insert({
      id: crypto.randomUUID(), user_id: a.id, fecha_local: '2026-08-18', kg: 70,
    })
    expect(error).not.toBeNull()
  })
})
