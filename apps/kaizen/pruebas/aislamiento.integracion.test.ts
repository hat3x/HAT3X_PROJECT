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

    // Fotos corporales: categoría especial de RGPD, igual que `pesos`. El
    // bucket y la política salen de la migración 0003, no de este test.
    const { error: errorSubida } = await a.cliente.storage
      .from('fotos')
      .upload(`${a.id}/foto-a.txt`, Buffer.from('contenido de a'), { contentType: 'text/plain' })
    expect(errorSubida).toBeNull()
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

  it('B no puede listar las fotos de A', async () => {
    const { data } = await b.cliente.storage.from('fotos').list(a.id)
    expect(data).toEqual([])
  })

  it('B no puede descargar una foto de A', async () => {
    const { data, error } = await b.cliente.storage.from('fotos').download(`${a.id}/foto-a.txt`)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  // Las dos anteriores solo ejercitan el `using` de la política (lectura).
  // Sin estas dos, romper el `with check` (escritura) en un refactor
  // dejaría la suite en verde con fotos corporales sin protección real.
  it('B no puede subir un fichero en la carpeta de A', async () => {
    const { error } = await b.cliente.storage
      .from('fotos')
      .upload(`${a.id}/intruso.txt`, Buffer.from('intruso'), { contentType: 'text/plain' })
    expect(error).not.toBeNull()
  })

  it('B no puede borrar una foto de A', async () => {
    await b.cliente.storage.from('fotos').remove([`${a.id}/foto-a.txt`])
    const { data } = await a.cliente.storage.from('fotos').list(a.id)
    expect(data).toHaveLength(1)
  })
})
