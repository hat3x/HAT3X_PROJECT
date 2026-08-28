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

/** La misma escritura que hace `usarEntrenamiento`: upsert por `id`. */
async function entrenar(
  cliente: SupabaseClient, userId: string, fecha: string,
  tipo: string, duracion: number | null,
) {
  const { error } = await cliente.from('entrenamientos').upsert(
    { id: crypto.randomUUID(), user_id: userId, fecha_local: fecha, tipo, duracion_min: duracion },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
}

it('se puede entrenar dos veces el mismo día y las dos sesiones cuentan', async () => {
  const yo = await usuarioNuevo('entreno-doble')
  const HOY = '2026-08-18'

  // Justo lo contrario que el peso: aquí NO se corrige la anterior. Pesas por
  // la mañana y carrera por la tarde son dos entrenamientos, no uno rectificado.
  await entrenar(yo.cliente, yo.id, HOY, 'fuerza', 60)
  await entrenar(yo.cliente, yo.id, HOY, 'cardio', 30)

  const { data } = await yo.cliente.from('entrenamientos').select('tipo').eq('fecha_local', HOY)
  expect(data).toHaveLength(2)
  expect(data!.map((f) => f.tipo).sort()).toEqual(['cardio', 'fuerza'])
})

it('la duración es opcional y se guarda como nula, no como cero', async () => {
  const yo = await usuarioNuevo('entreno-sin-duracion')
  await entrenar(yo.cliente, yo.id, '2026-08-18', 'movilidad', null)

  const { data } = await yo.cliente.from('entrenamientos').select('duracion_min')
  // Un cero significaría «una sesión de duración nula». Nulo significa «no lo
  // dijo», que es lo que de verdad pasó, y es lo que la pantalla sabe callar.
  expect(data![0]!.duracion_min).toBeNull()
})

it('el histórico de otra persona no se cuela en el tuyo', async () => {
  const yo = await usuarioNuevo('entreno-yo')
  const otro = await usuarioNuevo('entreno-otro')

  await entrenar(yo.cliente, yo.id, '2026-08-18', 'fuerza', 60)
  await entrenar(otro.cliente, otro.id, '2026-08-18', 'cardio', 45)

  const { data } = await yo.cliente.from('entrenamientos').select('tipo')
  expect(data).toHaveLength(1)
  expect(data![0]!.tipo).toBe('fuerza')
})
