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

/** Las dos escrituras que hace `escribirComida`, en el mismo orden. */
async function comer(
  cliente: SupabaseClient, userId: string, fecha: string, momento: string,
  nombre: string, kcal: number,
) {
  const conflicto = { onConflict: 'id', ignoreDuplicates: true } as const
  const idComida = crypto.randomUUID()
  const { error: e1 } = await cliente.from('comidas').upsert(
    { id: idComida, user_id: userId, fecha_local: fecha, momento }, conflicto,
  )
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await cliente.from('comida_items').upsert({
    id: crypto.randomUUID(), user_id: userId, comida_id: idComida, nombre,
    cantidad_g: 100, kcal, proteina_g: 10, carbos_g: 20, grasas_g: 5, fuente: 'rapida',
  }, conflicto)
  if (e2) throw new Error(e2.message)
}

/** La misma consulta que hace `usarNutricion`: renglones subiendo a su comida. */
async function deHoy(cliente: SupabaseClient, fecha: string) {
  const { data, error } = await cliente
    .from('comida_items')
    .select('nombre, kcal, comidas!inner(momento, fecha_local)')
    .eq('comidas.fecha_local', fecha)
  if (error) throw new Error(error.message)
  return data ?? []
}

it('lo comido hoy se lee con su momento, y lo de ayer no se cuela', async () => {
  const yo = await usuarioNuevo('nutri-yo')
  const HOY = '2026-08-18'

  await comer(yo.cliente, yo.id, HOY, 'desayuno', 'Avena', 350)
  await comer(yo.cliente, yo.id, HOY, 'comida', 'Pollo', 480)
  // El `!inner` sobre `comidas` es lo unico que impide que esto entre: la fecha
  // vive en la comida y los macros en el renglon.
  await comer(yo.cliente, yo.id, '2026-08-17', 'cena', 'Merluza', 300)

  const items = await deHoy(yo.cliente, HOY)
  expect(items.map((i) => i.nombre).sort()).toEqual(['Avena', 'Pollo'])
  expect(items.reduce((suma, i) => suma + Number(i.kcal), 0)).toBe(830)
})

it('la comida de otra persona no entra en tu dia', async () => {
  const yo = await usuarioNuevo('nutri-yo2')
  const otro = await usuarioNuevo('nutri-otro')
  const HOY = '2026-08-18'

  await comer(yo.cliente, yo.id, HOY, 'comida', 'Lo mio', 500)
  await comer(otro.cliente, otro.id, HOY, 'comida', 'Lo suyo', 900)

  const items = await deHoy(yo.cliente, HOY)
  expect(items).toHaveLength(1)
  expect(items[0]!.nombre).toBe('Lo mio')
})

it('borrar la comida se lleva sus renglones', async () => {
  const yo = await usuarioNuevo('nutri-cascada')
  const HOY = '2026-08-18'
  await comer(yo.cliente, yo.id, HOY, 'cena', 'Tortilla', 400)

  // `comida_items.comida_id` es `on delete cascade`: sin esa cascada, borrar
  // una comida dejaria renglones huerfanos que seguirian sumando en el total
  // del dia sin aparecer en ninguna lista.
  await yo.cliente.from('comidas').delete().eq('fecha_local', HOY)
  expect(await deHoy(yo.cliente, HOY)).toHaveLength(0)
  const { data } = await yo.cliente.from('comida_items').select('id')
  expect(data).toHaveLength(0)
})
