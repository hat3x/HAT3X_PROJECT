## Tarea 3: Esquema Supabase y RLS

**Ficheros:**
- Crear: `apps/kaizen/supabase/migraciones/0001_esquema.sql`
- Crear: `apps/kaizen/supabase/migraciones/0002_rls.sql`
- Test: `apps/kaizen/pruebas/aislamiento.integracion.test.ts`
- Crear: `apps/kaizen/jest.integracion.config.js`

**Interfaces:**
- Produce: las diez tablas del spec §5, todas con RLS activo.

- [ ] **Paso 1: Inicializar Supabase local**

```bash
cd apps/kaizen
npx supabase init
npx supabase start
```

Anota la `service_role key` y la `anon key` que imprime.

- [ ] **Paso 2: Escribir la migración del esquema**

`supabase/migraciones/0001_esquema.sql`:

```sql
create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null default '',
  fecha_nacimiento date,
  sexo text check (sexo in ('hombre','mujer','no_indica')),
  altura_cm integer,
  unidades text not null default 'metrico',
  zona_horaria text not null default 'Europe/Madrid',
  corte_dia smallint not null default 4 check (corte_dia between 0 and 12),
  hora_silencio smallint not null default 22 check (hora_silencio between 0 and 23),
  creado_en timestamptz not null default now()
);

create table objetivos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  vigente_desde date not null,
  kcal integer not null,
  proteina_g integer not null,
  carbos_g integer not null,
  grasas_g integer not null,
  agua_ml integer not null,
  objetivo text not null,
  origen text not null check (origen in ('auto','manual')),
  creado_en timestamptz not null default now(),
  unique (user_id, vigente_desde)
);

create table alimentos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  nombre text not null,
  kcal_100 numeric not null,
  proteina_100 numeric not null default 0,
  carbos_100 numeric not null default 0,
  grasas_100 numeric not null default 0,
  codigo_barras text,
  origen text not null check (origen in ('off','propio')),
  ultima_cantidad_g numeric,
  creado_en timestamptz not null default now()
);
create index on alimentos (user_id, codigo_barras);

create table comidas (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  momento text not null,
  registrado_en timestamptz not null default now()
);
create index on comidas (user_id, fecha_local);

create table comida_items (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  comida_id uuid not null references comidas on delete cascade,
  alimento_id uuid references alimentos on delete set null,
  nombre text not null,
  cantidad_g numeric not null,
  kcal numeric not null,
  proteina_g numeric not null,
  carbos_g numeric not null,
  grasas_g numeric not null,
  fuente text not null
);

create table registros_agua (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  ml integer not null,
  registrado_en timestamptz not null default now()
);
create index on registros_agua (user_id, fecha_local);

create table entrenamientos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  tipo text not null,
  duracion_min integer,
  intensidad smallint,
  notas text,
  registrado_en timestamptz not null default now()
);
create index on entrenamientos (user_id, fecha_local);

create table habitos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  nombre text not null,
  icono text,
  activo boolean not null default true,
  orden smallint not null default 0,
  hora_aviso smallint,
  hora_cierre smallint,
  avisos_activos boolean not null default false
);

create table habitos_registro (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  habito_id uuid not null references habitos on delete cascade,
  fecha_local date not null,
  hecho boolean not null default true,
  registrado_en timestamptz not null default now(),
  unique (habito_id, fecha_local)
);

create table pesos (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  fecha_local date not null,
  kg numeric not null,
  unique (user_id, fecha_local)
);
```

- [ ] **Paso 3: Escribir la migración de RLS**

`supabase/migraciones/0002_rls.sql`:

```sql
-- Conceder acceso de tabla al rol `authenticated` ANTES de activar RLS.
--
-- Las versiones recientes del CLI de Supabase no exponen automáticamente las
-- tablas nuevas de `public` a los roles de la API. Sin estos GRANT el rol no
-- tiene ningún privilegio sobre las tablas y toda consulta falla con
-- «permission denied», pase lo que pase con las políticas.
--
-- GRANT y RLS son capas independientes: el GRANT decide si el rol puede tocar
-- la tabla; la política decide qué filas ve una vez que puede.
--
-- A `anon` no se le concede nada: esta app exige sesión y los datos son
-- categoría especial del RGPD.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table perfiles           enable row level security;
alter table objetivos          enable row level security;
alter table alimentos          enable row level security;
alter table comidas            enable row level security;
alter table comida_items       enable row level security;
alter table registros_agua     enable row level security;
alter table entrenamientos     enable row level security;
alter table habitos            enable row level security;
alter table habitos_registro   enable row level security;
alter table pesos              enable row level security;

create policy "propio" on perfiles         for all using (id = auth.uid())      with check (id = auth.uid());
create policy "propio" on objetivos        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on alimentos        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on comidas          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on comida_items     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on registros_agua   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on entrenamientos   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on habitos          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on habitos_registro for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "propio" on pesos            for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Crear el perfil automáticamente al registrarse
create function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id) values (new.id);
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();
```

- [ ] **Paso 4: Aplicar las migraciones**

```bash
npx supabase migration up
```

- [ ] **Paso 5: Configurar el arnés de tests de integración**

`jest.integracion.config.js`:

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.integracion.test.ts'],
  transform: { '^.+\\.ts$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
}
```

Añadir a `package.json`: `"test:integracion": "jest --config jest.integracion.config.js"`.
Y excluir estos ficheros del arnés normal, en la clave `jest`: `"testPathIgnorePatterns": ["/node_modules/", "\\.integracion\\.test\\.ts$"]`.

- [ ] **Paso 6: Escribir el test de aislamiento**

`pruebas/aislamiento.integracion.test.ts`:

```ts
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
```

- [ ] **Paso 7: Escribir el test estructural que cubre las diez tablas**

El test anterior ejerce las cuatro operaciones a fondo, pero sobre **una** tabla. Las otras nueve quedarían sin red: si una tabla futura se crea sin `enable row level security`, **falla en abierto** —cualquier usuario autenticado ve las filas de todos— y nada lo detecta, porque la app «funciona» mientras la pruebe una sola persona. Un CRUD completo por tabla sería caro y repetitivo; esta comprobación estructural es barata y cierra justo ese escenario.

Instalar el cliente de Postgres solo para pruebas y añadir `DATABASE_URL` a `.env.test` y a `.env.test.example`:

```bash
npm install --save-dev pg @types/pg
```

`pruebas/rls-todas-las-tablas.integracion.test.ts`:

```ts
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
```

El primer test es el que hace que los otros tres no puedan volverse vacuos: sin él, borrar una tabla del esquema dejaría los tres siguientes en verde por no tener nada que comprobar.

- [ ] **Paso 8: Ejecutar y comprobar que pasa**

Ejecutar: `npm run test:integracion`
Esperado: los cuatro tests de aislamiento y los cuatro estructurales PASAN. Si alguno falla, la política RLS de esa tabla está mal y **hay que arreglarla antes de seguir**.

- [ ] **Paso 9: Comitear**

```bash
git add apps/kaizen/supabase apps/kaizen/pruebas apps/kaizen/jest.integracion.config.js apps/kaizen/package.json
git commit -m "feat(kaizen): esquema, RLS y test de aislamiento entre usuarios"
```

---

