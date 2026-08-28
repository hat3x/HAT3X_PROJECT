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

/** La misma escritura que hace `usarPeso`: upsert por (user_id, fecha_local). */
async function pesar(cliente: SupabaseClient, userId: string, fecha: string, kg: number) {
  const { error } = await cliente
    .from('pesos')
    .upsert({ id: crypto.randomUUID(), user_id: userId, fecha_local: fecha, kg }, {
      onConflict: 'user_id,fecha_local',
    })
  if (error) throw new Error(error.message)
}

it('pesarse dos veces el mismo día corrige el valor en vez de duplicar la fila', async () => {
  const yo = await usuarioNuevo('peso-yo')
  const HOY = '2026-08-18'

  await pesar(yo.cliente, yo.id, HOY, 78.4)
  // Segunda pesada del mismo día: el usuario se ha dado cuenta de que la
  // primera la hizo vestido. Debe sustituirla, no sumarse ni fallar por clave
  // duplicada — que es lo que pasaría resolviendo el conflicto por `id`.
  await pesar(yo.cliente, yo.id, HOY, 77.9)

  const { data } = await yo.cliente.from('pesos').select('fecha_local, kg').eq('fecha_local', HOY)
  expect(data).toHaveLength(1)
  expect(Number(data![0]!.kg)).toBe(77.9)
})

it('el histórico llega de más nuevo a más viejo y sin el peso de otra persona', async () => {
  const yo = await usuarioNuevo('peso-hist')
  const otro = await usuarioNuevo('peso-otro')

  await pesar(yo.cliente, yo.id, '2026-08-16', 79.0)
  await pesar(yo.cliente, yo.id, '2026-08-18', 78.4)
  await pesar(yo.cliente, yo.id, '2026-08-17', 78.8)
  // Mismo día que una de las mías: si RLS fallara, se colaría en mi histórico.
  await pesar(otro.cliente, otro.id, '2026-08-17', 91.2)

  const { data } = await yo.cliente
    .from('pesos')
    .select('fecha_local, kg')
    .order('fecha_local', { ascending: false })

  expect(data!.map((f) => f.fecha_local)).toEqual(['2026-08-18', '2026-08-17', '2026-08-16'])
  expect(data!.map((f) => Number(f.kg))).toEqual([78.4, 78.8, 79.0])
})
