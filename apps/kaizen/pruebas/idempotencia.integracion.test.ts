import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

it('reproducir la misma mutación dos veces crea un solo registro', async () => {
  const admin = createClient(URL, SERVICIO)
  const correo = `idem-${Date.now()}@prueba.local`
  const { data } = await admin.auth.admin.createUser({
    email: correo, password: 'contrasena-de-prueba', email_confirm: true,
  })
  const cliente = createClient(URL, ANON)
  await cliente.auth.signInWithPassword({ email: correo, password: 'contrasena-de-prueba' })

  const fila = {
    id: crypto.randomUUID(), user_id: data.user!.id,
    fecha_local: '2026-08-17', ml: 250,
  }

  await cliente.from('registros_agua').upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
  await cliente.from('registros_agua').upsert(fila, { onConflict: 'id', ignoreDuplicates: true })

  const { data: filas } = await cliente.from('registros_agua').select('*')
  expect(filas).toHaveLength(1)
})
