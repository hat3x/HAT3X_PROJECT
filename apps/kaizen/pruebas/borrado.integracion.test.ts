import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Ninguna migración crea todavía el bucket de fotos: subir fotos es una
// funcionalidad futura, fuera de este bloque. Se crea aquí, de forma
// idempotente, porque sin un fichero real que sobreviva o no al borrado,
// este test no demuestra nada sobre la única parte que el `on delete
// cascade` de auth.users NO limpia por su cuenta: el Storage.
const BUCKET = 'fotos'

it('borrar la cuenta elimina al usuario y todos sus datos', async () => {
  const admin = createClient(URL, SERVICIO)
  const correo = `borrar-${Date.now()}@prueba.local`
  const { data } = await admin.auth.admin.createUser({
    email: correo, password: 'contrasena-de-prueba', email_confirm: true,
  })
  const id = data.user!.id

  const cliente = createClient(URL, ANON)
  const { data: acceso } = await cliente.auth.signInWithPassword({
    email: correo, password: 'contrasena-de-prueba',
  })
  await cliente.from('pesos').insert({
    id: crypto.randomUUID(), user_id: id, fecha_local: '2026-08-17', kg: 80,
  })

  await admin.storage.createBucket(BUCKET, { public: false })
  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(`${id}/foto-prueba.txt`, Buffer.from('contenido de prueba'), { contentType: 'text/plain' })
  expect(errorSubida).toBeNull()

  const respuesta = await fetch(`${URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acceso.session!.access_token}` },
  })
  expect(respuesta.status).toBe(200)

  const { data: usuario } = await admin.auth.admin.getUserById(id)
  expect(usuario.user).toBeNull()

  const { count } = await admin.from('pesos').select('*', { count: 'exact', head: true }).eq('user_id', id)
  expect(count).toBe(0)

  // Esta es la comprobación que de verdad prueba la función: el cascade de
  // auth.users limpia las tablas solo, pero nunca toca Storage. Sin esto, el
  // test pasaría igual aunque la función no borrase ni un fichero.
  const { data: ficherosRestantes } = await admin.storage.from(BUCKET).list(id)
  expect(ficherosRestantes).toEqual([])
})
