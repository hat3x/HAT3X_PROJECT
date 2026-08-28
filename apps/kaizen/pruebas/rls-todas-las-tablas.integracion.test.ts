import { Client } from 'pg'

const TABLAS = [
  'perfiles', 'objetivos', 'alimentos', 'comidas', 'comida_items',
  'registros_agua', 'entrenamientos', 'habitos', 'habitos_registro', 'pesos',
]

let cliente: Client

beforeAll(async () => {
  cliente = new Client({ connectionString: process.env.DATABASE_URL })
  await cliente.connect()
})

afterAll(async () => {
  await cliente.end()
})

it('las diez tablas esperadas existen en public', async () => {
  const { rows } = await cliente.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  )
  expect(rows.map((f) => f.tablename).sort()).toEqual([...TABLAS].sort())
})

it('ninguna tabla de public se queda sin RLS activado', async () => {
  const { rows } = await cliente.query<{ tablename: string }>(
    `select tablename from pg_tables
      where schemaname = 'public' and rowsecurity = false`,
  )
  expect(rows.map((f) => f.tablename)).toEqual([])
})

it('ninguna tabla de public se queda sin política', async () => {
  const { rows } = await cliente.query<{ tablename: string }>(
    `select t.tablename from pg_tables t
      where t.schemaname = 'public'
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tablename
        )`,
  )
  expect(rows.map((f) => f.tablename)).toEqual([])
})

it('ninguna política concede acceso al rol anónimo', async () => {
  const { rows } = await cliente.query<{ tablename: string; roles: string[] }>(
    `select tablename, roles::text[] from pg_policies where schemaname = 'public'`,
  )
  const conAnon = rows.filter((f) => f.roles.includes('anon')).map((f) => f.tablename)
  expect(conAnon).toEqual([])
})
