import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

// El bucket `fotos` lo crea la migración 0003_almacenamiento.sql (privado,
// con política de acceso por carpeta propia) — este test se lo encuentra
// hecho, no lo crea: crearlo aquí probaría un mundo que no existe en
// producción, donde el bucket ya está ahí desde el primer despliegue.
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

// Caso más frecuente en producción: las fotos son opcionales. Rompería si
// `list` sobre una carpeta vacía devolviese error en vez de lista vacía —
// justo la suposición que ya falló una vez en esta tarea (el bucket que no
// existía). Ahora el bucket existe pero la carpeta del usuario está vacía.
it('borrar la cuenta funciona igual si nunca se subió ninguna foto', async () => {
  const admin = createClient(URL, SERVICIO)
  const correo = `borrar-sin-fotos-${Date.now()}@prueba.local`
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

  const respuesta = await fetch(`${URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acceso.session!.access_token}` },
  })
  expect(respuesta.status).toBe(200)

  const { data: usuario } = await admin.auth.admin.getUserById(id)
  expect(usuario.user).toBeNull()
})

// Este es el test que protege la paginación: `list` devuelve como mucho 100
// objetos por llamada, así que con una sola llamada el fichero 101
// sobrevive. Sin este test, esa corrección no está protegida —y ya se
// verificó a mano que se pone rojo con la versión de una sola llamada (ver
// el informe de la tarea).
it('borrar la cuenta borra más de un lote de fotos', async () => {
  const admin = createClient(URL, SERVICIO)
  const correo = `borrar-lote-${Date.now()}@prueba.local`
  const { data } = await admin.auth.admin.createUser({
    email: correo, password: 'contrasena-de-prueba', email_confirm: true,
  })
  const id = data.user!.id

  const cliente = createClient(URL, ANON)
  const { data: acceso } = await cliente.auth.signInWithPassword({
    email: correo, password: 'contrasena-de-prueba',
  })

  const TOTAL = 101
  const subidas = await Promise.all(
    Array.from({ length: TOTAL }, (_, i) =>
      admin.storage
        .from(BUCKET)
        .upload(`${id}/foto-${i}.txt`, Buffer.from(`contenido ${i}`), { contentType: 'text/plain' }),
    ),
  )
  expect(subidas.every((s) => s.error === null)).toBe(true)

  const respuesta = await fetch(`${URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acceso.session!.access_token}` },
  })
  expect(respuesta.status).toBe(200)

  const { data: ficherosRestantes } = await admin.storage.from(BUCKET).list(id, { limit: 1000 })
  expect(ficherosRestantes).toEqual([])
}, 30000)
