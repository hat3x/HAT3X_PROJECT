# KAIZEN Bloque 0 — Fundaciones · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** dejar en pie una app Expo que arranca, autentica contra Supabase, tiene el armazón de navegación con sistema de temas, una capa de datos que funciona sin conexión, y el esquema completo con RLS verificado.

**Arquitectura:** app Expo autocontenida en `apps/kaizen`. La lógica que puede fallar en silencio vive en `src/dominio/` sin dependencias de React ni Supabase, para poder probarla sin montar nada. La presentación consume exclusivamente tokens de un contrato de temas tipado. La capa de datos usa TanStack Query con caché persistida y una cola de mutaciones idempotentes por UUID de cliente.

**Stack:** Expo / React Native · TypeScript estricto · Expo Router · Supabase (Auth, Postgres, RLS, Storage) · TanStack Query · jest-expo + React Native Testing Library.

**Spec:** [docs/superpowers/specs/2026-08-17-kaizen-nucleo-bucle-diario-design.md](../specs/2026-08-17-kaizen-nucleo-bucle-diario-design.md)

## Restricciones globales

Se aplican a **todas** las tareas:

- **Nombres y textos en español.** Ficheros, funciones, tablas, columnas y textos de interfaz, igual que el resto del repositorio.
- **TypeScript estricto.** `strict: true`. Prohibido `any` y prohibido `@ts-ignore`.
- **`src/dominio/` no importa React ni Supabase.** Ni directa ni indirectamente.
- **Ninguna pantalla ni componente define un color, un radio, una fuente o un fondo por su cuenta.** Todo sale del tema.
- **Todas las tablas llevan `user_id` y política RLS `user_id = auth.uid()`** para select, insert, update y delete. Sin excepciones.
- **Toda mutación lleva un `id` UUID generado en el cliente.**
- **Valores por defecto:** `corte_dia` = 4 (04:00), `hora_silencio` = 22 (22:00).
- **Dos perfiles de EAS Build:** `tienda` y `personal`. El directorio del skin personal está fuera del control de versiones.
- Cada tarea termina con `npx tsc --noEmit` limpio y `npm test` en verde antes de comitear.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/dominio/dia.ts` | Cálculo de `fecha_local` a partir de instante, zona horaria y corte |
| `src/dominio/tipos.ts` | Tipos del dominio compartidos |
| `src/datos/supabase.ts` | Cliente Supabase único |
| `src/datos/sesion.tsx` | Contexto de sesión y hooks de autenticación |
| `src/datos/cliente-consultas.ts` | QueryClient, persistencia y cola offline |
| `src/datos/mutacion.ts` | Helper de mutación idempotente |
| `src/design/tema.ts` | **Contrato** de tema (interfaz TypeScript) |
| `src/design/temas/defecto.ts` | Tema oscuro, el de por defecto |
| `src/design/temas/claro.ts` | Tema claro — el segundo tema es lo que hace que el contrato esté probado |
| `src/design/temas/indice.ts` | Registro de temas disponibles en esta compilación |
| `src/features/perfil/ajustes.tsx` | Unidades, zona horaria, corte de día, hora de silencio, tema |
| `src/design/proveedor.tsx` | `ProveedorTema` y `useTema()` |
| `src/design/componentes/*.tsx` | `Superficie`, `Texto`, `Boton`, `Tarjeta`, `Anillo`, `Barra` |
| `src/app/**` | Rutas de Expo Router |
| `supabase/migraciones/*.sql` | Esquema y políticas |

---

## Tarea 1: Proyecto Expo, TypeScript estricto y arnés de tests

**Ficheros:**
- Crear: `apps/kaizen/` (proyecto completo)
- Crear: `apps/kaizen/src/dominio/tipos.ts`
- Test: `apps/kaizen/src/dominio/tipos.test.ts`

**Interfaces:**
- Produce: proyecto ejecutable con `npm test` y `npx tsc --noEmit` funcionando.

- [ ] **Paso 1: Crear el proyecto**

```bash
cd apps
npx create-expo-app@latest kaizen --template blank-typescript
cd kaizen
```

- [ ] **Paso 2: Instalar Expo Router y el arnés de tests**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npm install --save-dev jest-expo jest @types/jest @testing-library/react-native
```

- [ ] **Paso 3: Configurar `package.json`**

Añadir/ajustar estas claves:

```json
{
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "test": "jest",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Paso 4: Activar TypeScript estricto**

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

En `app.json`, dentro de `expo`, añadir `"scheme": "kaizen"`.

- [ ] **Paso 5: Escribir el test que prueba que el arnés funciona**

`src/dominio/tipos.test.ts`:

```ts
import { MOMENTOS, esMomento } from './tipos'

describe('momentos del día', () => {
  it('incluye los seis momentos', () => {
    expect(MOMENTOS).toEqual([
      'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
    ])
  })

  it('reconoce un momento válido', () => {
    expect(esMomento('cena')).toBe(true)
  })

  it('rechaza un valor que no es un momento', () => {
    expect(esMomento('brunch')).toBe(false)
  })
})
```

- [ ] **Paso 6: Ejecutar el test y comprobar que falla**

Ejecutar: `npm test`
Esperado: FALLA con «Cannot find module './tipos'».

- [ ] **Paso 7: Implementar el mínimo**

`src/dominio/tipos.ts`:

```ts
export const MOMENTOS = [
  'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
] as const

export type Momento = (typeof MOMENTOS)[number]

export function esMomento(valor: string): valor is Momento {
  return (MOMENTOS as readonly string[]).includes(valor)
}
```

- [ ] **Paso 8: Ejecutar el test y comprobar que pasa**

Ejecutar: `npm test` → PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 9: Comitear**

```bash
git add apps/kaizen
git commit -m "feat(kaizen): proyecto Expo con TypeScript estricto y arnes de tests"
```

---

## Tarea 2: Dominio — el día local

Todos los agregados de la app se hacen por `fecha_local`. Si esto está mal, todo lo demás está mal y no se nota hasta que alguien viaja o cena tarde.

**Ficheros:**
- Crear: `apps/kaizen/src/dominio/dia.ts`
- Test: `apps/kaizen/src/dominio/dia.test.ts`

**Interfaces:**
- Produce: `fechaLocal(instante: Date, zonaHoraria: string, corteHora: number): string` — devuelve `'YYYY-MM-DD'`.

- [ ] **Paso 1: Escribir los tests que fallan**

`src/dominio/dia.test.ts`:

```ts
import { fechaLocal } from './dia'

describe('fechaLocal', () => {
  it('una comida de mediodía cuenta en su propio día', () => {
    const instante = new Date('2026-08-17T12:00:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
  })

  it('una cena a la 01:30 cuenta como el día anterior con corte a las 4', () => {
    // 01:30 del 18 en Madrid = 23:30 UTC del 17
    const instante = new Date('2026-08-17T23:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
  })

  it('a las 04:30 ya cuenta como el día nuevo con corte a las 4', () => {
    // 04:30 del 18 en Madrid = 02:30 UTC del 18
    const instante = new Date('2026-08-18T02:30:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-18')
  })

  it('con corte a 0 la medianoche parte el día', () => {
    const instante = new Date('2026-08-17T23:30:00Z') // 01:30 del 18 en Madrid
    expect(fechaLocal(instante, 'Europe/Madrid', 0)).toBe('2026-08-18')
  })

  it('el mismo instante da días distintos en zonas distintas', () => {
    const instante = new Date('2026-08-17T23:00:00Z')
    expect(fechaLocal(instante, 'Europe/Madrid', 4)).toBe('2026-08-17')
    expect(fechaLocal(instante, 'America/Mexico_City', 4)).toBe('2026-08-17')
    expect(fechaLocal(instante, 'Pacific/Auckland', 4)).toBe('2026-08-18')
  })
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- dia.test`
Esperado: FALLA con «Cannot find module './dia'».

- [ ] **Paso 3: Implementar**

`src/dominio/dia.ts`:

```ts
/**
 * Devuelve el día (YYYY-MM-DD) al que cuenta un instante, según la zona
 * horaria del usuario y su corte de día.
 *
 * Con corte a las 4, todo lo registrado entre las 00:00 y las 03:59 cuenta
 * como el día anterior.
 */
export function fechaLocal(
  instante: Date,
  zonaHoraria: string,
  corteHora: number,
): string {
  const desplazado = new Date(instante.getTime() - corteHora * 3_600_000)
  const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formateador.format(desplazado)
}
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- dia.test` → PASA

> **Si estos tests fallan por la zona horaria** (todas las fechas salen iguales), el motor JavaScript del dispositivo no trae datos de zonas horarias. En ese caso instala el polyfill antes de seguir: `npx expo install @formatjs/intl-datetimeformat` e impórtalo junto con sus datos en el arranque. Es preferible descubrirlo aquí que al final del bloque.

- [ ] **Paso 5: Comitear**

```bash
git add apps/kaizen/src/dominio
git commit -m "feat(kaizen): calculo del dia local con corte configurable"
```

---

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

- [ ] **Paso 7: Ejecutar y comprobar que pasa**

Ejecutar: `npm run test:integracion`
Esperado: los cuatro tests PASAN. Si alguno falla, la política RLS de esa tabla está mal y **hay que arreglarla antes de seguir**.

- [ ] **Paso 8: Comitear**

```bash
git add apps/kaizen/supabase apps/kaizen/pruebas apps/kaizen/jest.integracion.config.js apps/kaizen/package.json
git commit -m "feat(kaizen): esquema, RLS y test de aislamiento entre usuarios"
```

---

## Tarea 4: Cliente Supabase y sesión

**Ficheros:**
- Crear: `apps/kaizen/src/datos/supabase.ts`
- Crear: `apps/kaizen/src/datos/sesion.tsx`
- Crear: `apps/kaizen/.env.example`
- Test: `apps/kaizen/src/datos/sesion.test.tsx`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: `supabase` (cliente), `ProveedorSesion`, `useSesion(): { sesion: Session | null; cargando: boolean }`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

- [ ] **Paso 2: Crear `.env.example`**

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Paso 3: Escribir el test que falla**

`src/datos/sesion.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ProveedorSesion, useSesion } from './sesion'

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}))

function Sonda() {
  const { sesion, cargando } = useSesion()
  return <Text>{cargando ? 'cargando' : sesion ? 'dentro' : 'fuera'}</Text>
}

it('empieza cargando y acaba sin sesión', async () => {
  render(<ProveedorSesion><Sonda /></ProveedorSesion>)
  await waitFor(() => expect(screen.getByText('fuera')).toBeTruthy())
})
```

- [ ] **Paso 4: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- sesion.test`
Esperado: FALLA con «Cannot find module './sesion'».

- [ ] **Paso 5: Implementar el cliente**

`src/datos/supabase.ts`:

```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !clave) {
  throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, clave, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Paso 6: Implementar el contexto de sesión**

`src/datos/sesion.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Estado = { sesion: Session | null; cargando: boolean }

const Contexto = createContext<Estado>({ sesion: null, cargando: true })

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ sesion: null, cargando: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEstado({ sesion: data.session, cargando: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setEstado({ sesion, cargando: false })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>
}

export function useSesion(): Estado {
  return useContext(Contexto)
}
```

- [ ] **Paso 7: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- sesion.test` → PASA

- [ ] **Paso 8: Comitear**

```bash
git add apps/kaizen/src/datos apps/kaizen/.env.example
git commit -m "feat(kaizen): cliente Supabase y contexto de sesion"
```

---

## Tarea 5: Autenticación — correo, Google y Apple

Apple **exige** Sign in with Apple si la app ofrece Google en iOS. No es opcional.

**Ficheros:**
- Crear: `apps/kaizen/src/datos/autenticacion.ts`
- Test: `apps/kaizen/src/datos/autenticacion.test.ts`

**Interfaces:**
- Consume: `supabase` de la Tarea 4.
- Produce: `entrarConCorreo(correo, contrasena)`, `registrarConCorreo(correo, contrasena)`, `entrarConApple()`, `salir()`. Todas devuelven `Promise<{ error: string | null }>`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install expo-apple-authentication expo-auth-session expo-web-browser expo-crypto
```

- [ ] **Paso 2: Escribir los tests que fallan**

`src/datos/autenticacion.test.ts`:

```ts
import { entrarConCorreo, salir } from './autenticacion'

const signInWithPassword = jest.fn()
const signOut = jest.fn()

jest.mock('./supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
                      signOut: () => signOut() } },
}))

beforeEach(() => jest.clearAllMocks())

it('devuelve error nulo cuando el acceso funciona', async () => {
  signInWithPassword.mockResolvedValue({ error: null })
  await expect(entrarConCorreo('a@b.c', 'clave')).resolves.toEqual({ error: null })
})

it('traduce el error de credenciales a un mensaje en español', async () => {
  signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
  const { error } = await entrarConCorreo('a@b.c', 'mal')
  expect(error).toBe('Correo o contraseña incorrectos.')
})

it('salir llama a signOut', async () => {
  signOut.mockResolvedValue({ error: null })
  await salir()
  expect(signOut).toHaveBeenCalled()
})
```

- [ ] **Paso 3: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- autenticacion.test`
Esperado: FALLA con «Cannot find module './autenticacion'».

- [ ] **Paso 4: Implementar**

`src/datos/autenticacion.ts`:

```ts
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from './supabase'

export type Resultado = { error: string | null }

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

function traducir(mensaje: string): string {
  return MENSAJES[mensaje] ?? 'No hemos podido completar la operación. Inténtalo de nuevo.'
}

export async function entrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena })
  return { error: error ? traducir(error.message) : null }
}

export async function registrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signUp({ email: correo, password: contrasena })
  return { error: error ? traducir(error.message) : null }
}

export async function entrarConApple(): Promise<Resultado> {
  try {
    const credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    })
    if (!credencial.identityToken) return { error: 'Apple no ha devuelto un token válido.' }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple', token: credencial.identityToken,
    })
    return { error: error ? traducir(error.message) : null }
  } catch {
    return { error: null } // el usuario canceló
  }
}

export async function salir(): Promise<Resultado> {
  const { error } = await supabase.auth.signOut()
  return { error: error ? traducir(error.message) : null }
}
```

> **Google** se añade en esta misma tarea con `expo-auth-session` y `supabase.auth.signInWithIdToken({ provider: 'google', token })`, siguiendo el mismo patrón que Apple. Requiere dar de alta los IDs de cliente OAuth en Google Cloud y en el panel de Supabase; hasta que existan esas credenciales, el botón se deja fuera de la pantalla en lugar de mostrarse roto.

- [ ] **Paso 5: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- autenticacion.test` → PASA

- [ ] **Paso 6: Comitear**

```bash
git add apps/kaizen/src/datos/autenticacion.ts apps/kaizen/src/datos/autenticacion.test.ts
git commit -m "feat(kaizen): autenticacion con correo y Apple"
```

> La **pantalla** de acceso se construye en la Tarea 9, cuando ya existen los componentes del sistema de diseño. Aquí solo se entrega el módulo.

---

## Tarea 6: Capa de datos con cola offline idempotente

**Ficheros:**
- Crear: `apps/kaizen/src/datos/cliente-consultas.ts`
- Crear: `apps/kaizen/src/datos/mutacion.ts`
- Test: `apps/kaizen/src/datos/mutacion.test.ts`
- Test: `apps/kaizen/pruebas/idempotencia.integracion.test.ts`

**Interfaces:**
- Consume: `supabase` de la Tarea 4.
- Produce: `crearClienteConsultas(): QueryClient`, `persistidor`, `nuevoId(): string`, `insertarIdempotente(tabla: string, fila: Record<string, unknown>): Promise<void>`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @react-native-community/netinfo
```

- [ ] **Paso 2: Escribir el test unitario que falla**

`src/datos/mutacion.test.ts`:

```ts
import { nuevoId } from './mutacion'

it('genera identificadores únicos con forma de UUID', () => {
  const a = nuevoId()
  const b = nuevoId()
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  expect(a).not.toBe(b)
})
```

- [ ] **Paso 3: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- mutacion.test`
Esperado: FALLA con «Cannot find module './mutacion'».

- [ ] **Paso 4: Implementar**

`src/datos/mutacion.ts`:

```ts
import * as Crypto from 'expo-crypto'
import { supabase } from './supabase'

/** Identificador generado en el dispositivo. Es lo que hace segura la cola offline. */
export function nuevoId(): string {
  return Crypto.randomUUID()
}

/**
 * Inserta una fila cuyo `id` viene del cliente. Si la fila ya existe porque
 * un reintento anterior sí llegó, no hace nada en lugar de duplicar.
 */
export async function insertarIdempotente(
  tabla: string,
  fila: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from(tabla).upsert(fila, {
    onConflict: 'id',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(error.message)
}
```

`src/datos/cliente-consultas.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((estado) => setOnline(!!estado.isConnected)),
)

export function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 1000 * 60 * 60 * 24, retry: 2 },
      mutations: { retry: 3, networkMode: 'offlineFirst' },
    },
  })
}

export const persistidor = createAsyncStoragePersister({ storage: AsyncStorage })
```

- [ ] **Paso 5: Escribir el test de integración de idempotencia**

`pruebas/idempotencia.integracion.test.ts`:

```ts
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
```

- [ ] **Paso 6: Ejecutar ambos y comprobar que pasan**

Ejecutar: `npm test -- mutacion.test` → PASA
Ejecutar: `npm run test:integracion` → PASA

- [ ] **Paso 7: Comitear**

```bash
git add apps/kaizen/src/datos apps/kaizen/pruebas
git commit -m "feat(kaizen): capa de datos con cola offline e inserciones idempotentes"
```

---

## Tarea 7: Contrato de temas y tema por defecto

**Ficheros:**
- Crear: `apps/kaizen/src/design/tema.ts`
- Crear: `apps/kaizen/src/design/temas/defecto.ts`
- Crear: `apps/kaizen/src/design/temas/indice.ts`
- Test: `apps/kaizen/src/design/temas/contrato.test.ts`

**Interfaces:**
- Produce: `interface Tema`, `temaDefecto: Tema`, `TEMAS: Record<string, Tema>`.

- [ ] **Paso 1: Escribir el test que falla**

`src/design/temas/contrato.test.ts`:

```ts
import { TEMAS } from './indice'

function rutas(objeto: unknown, prefijo = ''): string[] {
  if (objeto === null || typeof objeto !== 'object' || Array.isArray(objeto)) return [prefijo]
  return Object.entries(objeto).flatMap(([clave, valor]) =>
    rutas(valor, prefijo ? `${prefijo}.${clave}` : clave),
  )
}

function valorEn(objeto: unknown, ruta: string): unknown {
  let actual: unknown = objeto
  for (const parte of ruta.split('.')) {
    actual = (actual as Record<string, unknown>)[parte]
  }
  return actual
}

const nombres = Object.keys(TEMAS)

it('hay al menos un tema registrado', () => {
  expect(nombres.length).toBeGreaterThan(0)
})

it('ningún tema deja valores sin definir', () => {
  for (const nombre of nombres) {
    const sinDefinir = rutas(TEMAS[nombre]).filter((r) => valorEn(TEMAS[nombre], r) === undefined)
    expect({ tema: nombre, sinDefinir }).toEqual({ tema: nombre, sinDefinir: [] })
  }
})

it('todos los temas declaran exactamente las mismas claves', () => {
  const referencia = rutas(TEMAS[nombres[0]!]).sort()
  for (const nombre of nombres.slice(1)) {
    expect({ tema: nombre, claves: rutas(TEMAS[nombre]).sort() })
      .toEqual({ tema: nombre, claves: referencia })
  }
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- contrato.test`
Esperado: FALLA con «Cannot find module './indice'».

- [ ] **Paso 3: Escribir el contrato**

`src/design/tema.ts`:

```ts
import type { ImageSourcePropType } from 'react-native'

export type Recuadro = { arriba: number; izquierda: number; abajo: number; derecha: number }

export type Fondo =
  | { tipo: 'color'; valor: string }
  | { tipo: 'degradado'; desde: string; hasta: string }
  | { tipo: 'recurso'; fuente: ImageSourcePropType; recuadro: Recuadro | null }

export type RecetaBarra = 'continua' | 'segmentada'
export type RecetaAnillo = 'liso' | 'medidor'

export interface Tema {
  nombre: string
  esquema: 'claro' | 'oscuro'

  color: {
    acento: string
    sobreAcento: string
    texto: string
    textoTenue: string
    borde: string
    pista: string
    proteina: string
    carbos: string
    grasas: string
  }

  radio: { tarjeta: number; boton: number; pastilla: number }

  espaciado: readonly [number, number, number, number, number, number, number, number, number]

  tipografia: {
    familiaTitular: string | null
    familiaCuerpo: string | null
    pesoTitular: '600' | '700' | '800'
    pesoCuerpo: '400' | '500' | '600'
    ajusteLinea: number
    mayusculasEtiquetas: boolean
  }

  fondo: { pantalla: Fondo; velo: string }

  superficie: { tarjeta: Fondo; barraInferior: Fondo; desenfoque: number }

  recetas: { barra: RecetaBarra; anillo: RecetaAnillo }

  decoracion: {
    cabecera: ImageSourcePropType | null
    tarjetaEntrenamiento: ImageSourcePropType | null
    tarjetaMision: ImageSourcePropType | null
  }
}
```

- [ ] **Paso 4: Escribir el tema por defecto y el registro**

`src/design/temas/defecto.ts`:

```ts
import type { Tema } from '../tema'

export const temaDefecto: Tema = {
  nombre: 'defecto',
  esquema: 'oscuro',
  color: {
    acento: '#4ECB9C',
    sobreAcento: '#04120C',
    texto: '#F4F5F2',
    textoTenue: '#98A09A',
    borde: 'rgba(255,255,255,0.10)',
    pista: 'rgba(255,255,255,0.10)',
    proteina: '#E8A87C',
    carbos: '#7EA8D9',
    grasas: '#D9B26F',
  },
  radio: { tarjeta: 22, boton: 13, pastilla: 20 },
  espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  tipografia: {
    familiaTitular: null,
    familiaCuerpo: null,
    pesoTitular: '600',
    pesoCuerpo: '500',
    ajusteLinea: 1,
    mayusculasEtiquetas: true,
  },
  fondo: {
    pantalla: { tipo: 'color', valor: '#060807' },
    velo: 'rgba(0,0,0,0)',
  },
  superficie: {
    tarjeta: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    barraInferior: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    desenfoque: 22,
  },
  recetas: { barra: 'continua', anillo: 'liso' },
  decoracion: { cabecera: null, tarjetaEntrenamiento: null, tarjetaMision: null },
}
```

- [ ] **Paso 5: Escribir el tema claro**

No es decoración: **un sistema de temas con un solo tema no está probado.** El test de claves idénticas es vacío mientras haya uno solo, y el primer skin descubriría los agujeros en producción. Este segundo tema es el que valida el contrato.

`src/design/temas/claro.ts`:

```ts
import type { Tema } from '../tema'

export const temaClaro: Tema = {
  nombre: 'claro',
  esquema: 'claro',
  color: {
    acento: '#1E9E73',
    sobreAcento: '#FFFFFF',
    texto: '#141715',
    textoTenue: '#6B726C',
    borde: 'rgba(0,0,0,0.10)',
    pista: 'rgba(0,0,0,0.08)',
    proteina: '#C97A45',
    carbos: '#4A7FBF',
    grasas: '#B08A3C',
  },
  radio: { tarjeta: 22, boton: 13, pastilla: 20 },
  espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  tipografia: {
    familiaTitular: null,
    familiaCuerpo: null,
    pesoTitular: '600',
    pesoCuerpo: '500',
    ajusteLinea: 1,
    mayusculasEtiquetas: true,
  },
  fondo: {
    pantalla: { tipo: 'color', valor: '#FAF9F7' },
    velo: 'rgba(255,255,255,0)',
  },
  superficie: {
    tarjeta: { tipo: 'degradado', desde: 'rgba(255,255,255,0.92)', hasta: 'rgba(255,255,255,0.75)' },
    barraInferior: { tipo: 'degradado', desde: 'rgba(255,255,255,0.92)', hasta: 'rgba(255,255,255,0.75)' },
    desenfoque: 22,
  },
  recetas: { barra: 'continua', anillo: 'liso' },
  decoracion: { cabecera: null, tarjetaEntrenamiento: null, tarjetaMision: null },
}
```

`src/design/temas/indice.ts`:

```ts
import type { Tema } from '../tema'
import { temaDefecto } from './defecto'
import { temaClaro } from './claro'

/**
 * Temas disponibles en ESTA compilación.
 *
 * El perfil `personal` de EAS añade aquí su propio tema desde un directorio
 * fuera del control de versiones. El perfil `tienda` nunca lo incluye.
 */
export const TEMAS: Record<string, Tema> = {
  defecto: temaDefecto,
  claro: temaClaro,
}
```

- [ ] **Paso 6: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- contrato.test` → PASA con los dos temas registrados.

- [ ] **Paso 7: Comitear**

```bash
git add apps/kaizen/src/design
git commit -m "feat(kaizen): contrato de temas tipado con tema oscuro y claro"
```

---

## Tarea 8: Proveedor de tema y componentes base

**Ficheros:**
- Crear: `apps/kaizen/src/design/proveedor.tsx`
- Crear: `apps/kaizen/src/design/componentes/{superficie,texto,boton,anillo,barra}.tsx`
- Test: `apps/kaizen/src/design/componentes/componentes.test.tsx`

**Interfaces:**
- Consume: `Tema`, `TEMAS` de la Tarea 7.
- Produce: `ProveedorTema`, `useTema(): Tema`, `Superficie`, `Texto`, `Boton`, `Anillo`, `Barra`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install expo-blur react-native-svg
```

- [ ] **Paso 2: Escribir los tests que fallan**

`src/design/componentes/componentes.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ProveedorTema } from '../proveedor'
import { Texto } from './texto'
import { Boton } from './boton'
import { Barra } from './barra'

function envolver(nodo: React.ReactNode) {
  return render(<ProveedorTema nombre="defecto">{nodo}</ProveedorTema>)
}

it('el texto toma el color del tema', () => {
  envolver(<Texto>Hola</Texto>)
  expect(screen.getByText('Hola')).toHaveStyle({ color: '#F4F5F2' })
})

it('la etiqueta usa el color tenue y va en mayúsculas', () => {
  envolver(<Texto variante="etiqueta">Agua</Texto>)
  expect(screen.getByText('AGUA')).toHaveStyle({ color: '#98A09A' })
})

it('el botón dispara su acción', () => {
  const alPulsar = jest.fn()
  envolver(<Boton titulo="Registrar" alPulsar={alPulsar} />)
  fireEvent.press(screen.getByText('Registrar'))
  expect(alPulsar).toHaveBeenCalledTimes(1)
})

it('la barra recorta el progreso al 100 por ciento', () => {
  envolver(<Barra progreso={1.8} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '100%' })
})

it('la barra no acepta progresos negativos', () => {
  envolver(<Barra progreso={-0.5} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '0%' })
})
```

- [ ] **Paso 3: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- componentes.test`
Esperado: FALLA con «Cannot find module '../proveedor'».

- [ ] **Paso 4: Implementar el proveedor**

`src/design/proveedor.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { Tema } from './tema'
import { TEMAS } from './temas/indice'

const Contexto = createContext<Tema>(TEMAS.defecto!)

export function ProveedorTema({ nombre, children }: { nombre: string; children: ReactNode }) {
  const tema = TEMAS[nombre] ?? TEMAS.defecto!
  return <Contexto.Provider value={tema}>{children}</Contexto.Provider>
}

export function useTema(): Tema {
  return useContext(Contexto)
}
```

- [ ] **Paso 5: Implementar `Texto`**

`src/design/componentes/texto.tsx`:

```tsx
import { Text, type TextProps } from 'react-native'
import { useTema } from '../proveedor'

type Variante = 'heroe' | 'titulo' | 'cuerpo' | 'etiqueta' | 'tenue'

const TAMANOS: Record<Variante, number> = {
  heroe: 50, titulo: 19, cuerpo: 15, etiqueta: 10, tenue: 12,
}

export function Texto({ variante = 'cuerpo', style, children, ...resto }:
  TextProps & { variante?: Variante }) {
  const t = useTema()
  const esEtiqueta = variante === 'etiqueta'
  const esTitular = variante === 'heroe' || variante === 'titulo'
  const contenido = esEtiqueta && t.tipografia.mayusculasEtiquetas && typeof children === 'string'
    ? children.toUpperCase()
    : children

  return (
    <Text
      {...resto}
      style={[{
        color: esEtiqueta || variante === 'tenue' ? t.color.textoTenue : t.color.texto,
        fontSize: TAMANOS[variante],
        lineHeight: TAMANOS[variante] * 1.35 * t.tipografia.ajusteLinea,
        fontWeight: esTitular ? t.tipografia.pesoTitular : t.tipografia.pesoCuerpo,
        fontFamily: (esTitular ? t.tipografia.familiaTitular : t.tipografia.familiaCuerpo) ?? undefined,
        letterSpacing: esEtiqueta ? 1.3 : 0,
      }, style]}
    >
      {contenido}
    </Text>
  )
}
```

- [ ] **Paso 6: Implementar `Barra`**

`src/design/componentes/barra.tsx`:

```tsx
import { View } from 'react-native'
import { useTema } from '../proveedor'

export function Barra({ progreso, color, alto = 7 }:
  { progreso: number; color: string; alto?: number }) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))

  if (t.recetas.barra === 'segmentada') {
    const total = 10
    const llenos = Math.round(recortado * total)
    return (
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View testID="barra-relleno" style={{ width: `${recortado * 100}%`, flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={{
              flex: 1, height: alto, borderRadius: 2,
              backgroundColor: i < llenos ? color : t.color.pista,
            }} />
          ))}
        </View>
      </View>
    )
  }

  return (
    <View style={{ height: alto, borderRadius: alto, backgroundColor: t.color.pista, overflow: 'hidden' }}>
      <View testID="barra-relleno"
            style={{ width: `${recortado * 100}%`, height: '100%', borderRadius: alto, backgroundColor: color }} />
    </View>
  )
}
```

- [ ] **Paso 7: Implementar `Boton`**

`src/design/componentes/boton.tsx`:

```tsx
import { Pressable } from 'react-native'
import { useTema } from '../proveedor'
import { Texto } from './texto'

export function Boton({ titulo, alPulsar, tono = 'primario' }:
  { titulo: string; alPulsar: () => void; tono?: 'primario' | 'secundario' }) {
  const t = useTema()
  const primario = tono === 'primario'
  return (
    <Pressable
      onPress={alPulsar}
      accessibilityRole="button"
      style={{
        paddingVertical: t.espaciado[1],
        paddingHorizontal: t.espaciado[2],
        borderRadius: t.radio.boton,
        backgroundColor: primario ? t.color.acento : 'transparent',
        borderWidth: primario ? 0 : 1,
        borderColor: t.color.borde,
        alignItems: 'center',
      }}
    >
      <Texto style={{ color: primario ? t.color.sobreAcento : t.color.texto, fontWeight: '700' }}>
        {titulo}
      </Texto>
    </Pressable>
  )
}
```

- [ ] **Paso 8: Implementar `Superficie`**

Es la pieza que permite que un tema pinte una tarjeta con color plano y otro con arte estirable, sin que la pantalla se entere.

`src/design/componentes/superficie.tsx`:

```tsx
import { View, ImageBackground, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import type { Fondo } from '../tema'
import { useTema } from '../proveedor'

export function Superficie({ fondo, radio, style, children }: {
  fondo: Fondo
  radio: number
  style?: ViewStyle
  children?: ReactNode
}) {
  const t = useTema()
  const base: ViewStyle = {
    borderRadius: radio,
    borderWidth: 1,
    borderColor: t.color.borde,
    overflow: 'hidden',
    ...style,
  }

  if (fondo.tipo === 'color') {
    return <View style={[base, { backgroundColor: fondo.valor }]}>{children}</View>
  }

  if (fondo.tipo === 'recurso') {
    const r = fondo.recuadro
    return (
      <ImageBackground
        source={fondo.fuente}
        capInsets={r ? { top: r.arriba, left: r.izquierda, bottom: r.abajo, right: r.derecha } : undefined}
        resizeMode="stretch"
        style={base}
        imageStyle={{ borderRadius: radio }}
      >
        {children}
      </ImageBackground>
    )
  }

  return (
    <BlurView
      intensity={t.superficie.desenfoque}
      tint={t.esquema === 'oscuro' ? 'dark' : 'light'}
      style={base}
    >
      <View style={{ backgroundColor: fondo.desde, flex: 1 }}>{children}</View>
    </BlurView>
  )
}
```

- [ ] **Paso 9: Implementar `Anillo`**

`src/design/componentes/anillo.tsx`:

```tsx
import Svg, { Circle, Line } from 'react-native-svg'
import { View } from 'react-native'
import type { ReactNode } from 'react'
import { useTema } from '../proveedor'

export function Anillo({ progreso, tamano = 168, grosor = 12, children }: {
  progreso: number
  tamano?: number
  grosor?: number
  children?: ReactNode
}) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))
  const centro = tamano / 2
  const radio = centro - grosor / 2 - 6
  const vuelta = 2 * Math.PI * radio

  return (
    <View style={{ width: tamano, height: tamano }}>
      <Svg width={tamano} height={tamano}>
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.pista} strokeWidth={grosor} />
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.acento} strokeWidth={grosor} strokeLinecap="round"
                strokeDasharray={`${vuelta * recortado} ${vuelta}`}
                transform={`rotate(-90 ${centro} ${centro})`} />
        {t.recetas.anillo === 'medidor' &&
          [0, 0.25, 0.5, 0.75].map((fraccion) => {
            const angulo = (fraccion * 2 - 0.5) * Math.PI
            return (
              <Line key={fraccion}
                    x1={centro + Math.cos(angulo) * (radio + grosor / 2 + 1)}
                    y1={centro + Math.sin(angulo) * (radio + grosor / 2 + 1)}
                    x2={centro + Math.cos(angulo) * (radio + grosor / 2 + 5)}
                    y2={centro + Math.sin(angulo) * (radio + grosor / 2 + 5)}
                    stroke={t.color.textoTenue} strokeWidth={2} />
            )
          })}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  )
}
```

- [ ] **Paso 10: Ejecutar y comprobar que pasan**

Ejecutar: `npm test -- componentes.test` → PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 11: Comitear**

```bash
git add apps/kaizen/src/design
git commit -m "feat(kaizen): proveedor de tema y componentes base"
```

---

## Tarea 9: Navegación, hoja del + y pantalla de acceso

**Ficheros:**
- Crear: `apps/kaizen/src/app/_layout.tsx`
- Crear: `apps/kaizen/src/app/(pestanas)/_layout.tsx`
- Crear: `apps/kaizen/src/app/(pestanas)/{index,nutricion,entrenamiento,evolucion,coach}.tsx`
- Crear: `apps/kaizen/src/app/anadir.tsx`
- Crear: `apps/kaizen/src/app/acceso.tsx`
- Test: `apps/kaizen/src/app/navegacion.test.tsx`

**Interfaces:**
- Consume: `ProveedorSesion`/`useSesion` (Tarea 4), `entrarConCorreo`/`registrarConCorreo`/`entrarConApple` (Tarea 5), `crearClienteConsultas`/`persistidor` (Tarea 6), `ProveedorTema`/`Texto`/`Boton` (Tarea 8).

- [ ] **Paso 1: Escribir el test que falla**

`src/app/navegacion.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native'
import Coach from './(pestanas)/coach'
import { ProveedorTema } from '@/design/proveedor'

it('Coach muestra su estado vacío explicando por qué', () => {
  render(<ProveedorTema nombre="defecto"><Coach /></ProveedorTema>)
  expect(screen.getByText(/todavía no tengo datos suficientes/i)).toBeTruthy()
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- navegacion.test`
Esperado: FALLA con «Cannot find module './(pestanas)/coach'».

- [ ] **Paso 3: Implementar el layout raíz**

`src/app/_layout.tsx`:

```tsx
import { Stack, Redirect } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ProveedorSesion, useSesion } from '@/datos/sesion'
import { crearClienteConsultas, persistidor } from '@/datos/cliente-consultas'
import { ProveedorTema } from '@/design/proveedor'

const cliente = crearClienteConsultas()

function Puerta() {
  const { sesion, cargando } = useSesion()
  if (cargando) return null
  if (!sesion) return <Redirect href="/acceso" />
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(pestanas)" />
      <Stack.Screen name="anadir" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

export default function Raiz() {
  return (
    <PersistQueryClientProvider client={cliente} persistOptions={{ persister: persistidor }}>
      <ProveedorSesion>
        <ProveedorTema nombre="defecto">
          <Puerta />
        </ProveedorTema>
      </ProveedorSesion>
    </PersistQueryClientProvider>
  )
}
```

- [ ] **Paso 4: Implementar la pestaña Coach**

`src/app/(pestanas)/coach.tsx`:

```tsx
import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Coach() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Coach</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Todavía no tengo datos suficientes sobre ti. Registra unos días y aquí
        empezaré a decirte cosas que valgan la pena.
      </Texto>
    </View>
  )
}
```

- [ ] **Paso 5: Implementar el layout de pestañas**

`src/app/(pestanas)/_layout.tsx`:

```tsx
import { Tabs, useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Superficie } from '@/design/componentes/superficie'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

function BotonAnadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push('/anadir')}
      accessibilityRole="button"
      accessibilityLabel="Añadir registro"
      style={{
        width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.color.acento, marginTop: -18,
      }}
    >
      <Texto variante="titulo" style={{ color: t.color.sobreAcento }}>+</Texto>
    </Pressable>
  )
}

export default function LayoutPestanas() {
  const t = useTema()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.acento,
        tabBarInactiveTintColor: t.color.textoTenue,
        tabBarStyle: { position: 'absolute', borderTopWidth: 0, backgroundColor: 'transparent' },
        tabBarBackground: () => (
          <Superficie fondo={t.superficie.barraInferior} radio={0} style={{ flex: 1 }} />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
      <Tabs.Screen
        name="anadir-hueco"
        options={{ title: '', tabBarButton: () => <BotonAnadir /> }}
      />
      <Tabs.Screen name="entrenamiento" options={{ title: 'Entreno' }} />
      <Tabs.Screen name="evolucion" options={{ title: 'Evolución' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
    </Tabs>
  )
}
```

Crear también `src/app/(pestanas)/anadir-hueco.tsx` con `export default function Hueco() { return null }`. Existe solo para reservar el sitio central del **+**, que abre un modal en vez de navegar a una pestaña.

- [ ] **Paso 6: Implementar las otras tres pestañas**

`nutricion.tsx`, `entrenamiento.tsx` y `evolucion.tsx` copian exactamente la estructura de `coach.tsx` del Paso 4, cambiando el título y el texto:

- Nutrición → «Aquí verás tu histórico de comidas. Empieza registrando algo desde el botón +.»
- Entreno → «Tus entrenamientos aparecerán aquí en cuanto registres el primero.»
- Evolución → «Cuando lleves unas semanas registrando, aquí verás cómo has cambiado.»

`index.tsx` muestra por ahora el saludo y el contexto del día con `Texto`; el Home completo es del bloque 1.

- [ ] **Paso 7: Implementar la hoja del +**

`src/app/anadir.tsx`:

```tsx
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

const OPCIONES = [
  { clave: 'buscar',    titulo: 'Buscar alimento',   ruta: '/nutricion/buscar' },
  { clave: 'escanear',  titulo: 'Escanear código',   ruta: '/nutricion/escanear' },
  { clave: 'rapida',    titulo: 'Entrada rápida',    ruta: '/nutricion/rapida' },
  { clave: 'agua',      titulo: 'Agua',              ruta: '/agua' },
  { clave: 'entreno',   titulo: 'Entrenamiento',     ruta: '/entrenamiento/nuevo' },
  { clave: 'peso',      titulo: 'Peso',              ruta: '/peso/nuevo' },
] as const

export default function Anadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <View style={{ flex: 1, padding: t.espaciado[3], gap: t.espaciado[1] }}>
      <Texto variante="etiqueta">Añadir</Texto>
      {OPCIONES.map((o) => (
        <Pressable
          key={o.clave}
          accessibilityRole="button"
          onPress={() => router.replace(o.ruta)}
          style={{ paddingVertical: t.espaciado[3] }}
        >
          <Texto>{o.titulo}</Texto>
        </Pressable>
      ))}
    </View>
  )
}
```

**Las seis rutas de destino se crean en el bloque 1.** Hasta entonces navegan a pantallas que no existen: al ejecutar este plan, deja las entradas visibles pero apuntando a `/` y anota el pendiente. No añadas opciones deshabilitadas ni «próximamente».

- [ ] **Paso 8: Implementar la pantalla de acceso**

`src/app/acceso.tsx`:

```tsx
import { useState } from 'react'
import { View, TextInput, Platform } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { useTema } from '@/design/proveedor'
import { entrarConCorreo, registrarConCorreo, entrarConApple } from '@/datos/autenticacion'

export default function Acceso() {
  const t = useTema()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function ejecutar(accion: () => Promise<{ error: string | null }>) {
    setOcupado(true)
    setError((await accion()).error)
    setOcupado(false)
  }

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5], gap: t.espaciado[2] }}>
      <Texto variante="titulo">Entrar en KAIZEN</Texto>

      <TextInput
        style={campo}
        value={correo}
        onChangeText={setCorreo}
        placeholder="Correo"
        placeholderTextColor={t.color.textoTenue}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={campo}
        value={contrasena}
        onChangeText={setContrasena}
        placeholder="Contraseña"
        placeholderTextColor={t.color.textoTenue}
        secureTextEntry
      />

      {error && <Texto variante="tenue" style={{ color: '#E2574C' }}>{error}</Texto>}

      <Boton titulo={ocupado ? 'Un momento…' : 'Entrar'}
             alPulsar={() => ejecutar(() => entrarConCorreo(correo, contrasena))} />
      <Boton titulo="Crear cuenta" tono="secundario"
             alPulsar={() => ejecutar(() => registrarConCorreo(correo, contrasena))} />
      {Platform.OS === 'ios' && (
        <Boton titulo="Continuar con Apple" tono="secundario"
               alPulsar={() => ejecutar(entrarConApple)} />
      )}
    </View>
  )
}
```

- [ ] **Paso 9: Ejecutar y comprobar que pasa**

Ejecutar: `npm test` → todo PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 10: Comitear**

```bash
git add apps/kaizen/src/app
git commit -m "feat(kaizen): navegacion de cinco pestanas, hoja de anadir y acceso"
```

---

## Tarea 10: Borrado real de cuenta

Exigencia del RGPD por tratarse de datos de categoría especial (spec §13). Borrar el usuario de `auth.users` arrastra las tablas por `on delete cascade`, pero **no borra los objetos de Storage**: eso hay que hacerlo explícitamente.

**Ficheros:**
- Crear: `apps/kaizen/supabase/functions/borrar-cuenta/index.ts`
- Crear: `apps/kaizen/src/features/perfil/borrar-cuenta.tsx`
- Test: `apps/kaizen/pruebas/borrado.integracion.test.ts`

**Interfaces:**
- Produce: Edge Function `borrar-cuenta`, que autentica al llamante por su token y borra su propio usuario.

- [ ] **Paso 1: Escribir el test de integración que falla**

`pruebas/borrado.integracion.test.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

  const respuesta = await fetch(`${URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acceso.session!.access_token}` },
  })
  expect(respuesta.status).toBe(200)

  const { data: usuario } = await admin.auth.admin.getUserById(id)
  expect(usuario.user).toBeNull()

  const { count } = await admin.from('pesos').select('*', { count: 'exact', head: true }).eq('user_id', id)
  expect(count).toBe(0)
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

```bash
npx supabase functions serve borrar-cuenta &
npm run test:integracion -- borrado
```
Esperado: FALLA porque la función no existe.

- [ ] **Paso 3: Implementar la Edge Function**

`supabase/functions/borrar-cuenta/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (peticion) => {
  const cabecera = peticion.headers.get('Authorization')
  if (!cabecera) return new Response('Falta autorización', { status: 401 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await admin.auth.getUser(cabecera.replace('Bearer ', ''))
  if (error || !data.user) return new Response('Sesión no válida', { status: 401 })

  const id = data.user.id

  // Los objetos de Storage no se borran en cascada: hay que quitarlos a mano.
  const { data: ficheros } = await admin.storage.from('fotos').list(id)
  if (ficheros?.length) {
    await admin.storage.from('fotos').remove(ficheros.map((f) => `${id}/${f.name}`))
  }

  const { error: errorBorrado } = await admin.auth.admin.deleteUser(id)
  if (errorBorrado) return new Response(errorBorrado.message, { status: 500 })

  return new Response('ok', { status: 200 })
})
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm run test:integracion -- borrado` → PASA

- [ ] **Paso 5: Crear la pantalla en el perfil**

`src/features/perfil/borrar-cuenta.tsx` — a diferencia del borrado de un registro (que va sin confirmación y con «deshacer»), **este sí pide confirmación escribiendo la palabra BORRAR**, porque es irreversible y no tiene deshacer.

- [ ] **Paso 6: Comitear**

```bash
git add apps/kaizen/supabase/functions apps/kaizen/src/features/perfil apps/kaizen/pruebas
git commit -m "feat(kaizen): borrado real de cuenta con limpieza de Storage"
```

---

## Tarea 11: Perfil y ajustes

Sin esta pantalla, los valores de los que depende todo el cálculo del día —zona horaria y corte— quedan fijados en sus valores por defecto y no hay forma de cambiarlos.

**Ficheros:**
- Crear: `apps/kaizen/src/features/perfil/usar-perfil.ts`
- Crear: `apps/kaizen/src/features/perfil/ajustes.tsx`
- Modificar: `apps/kaizen/src/app/(pestanas)/index.tsx` (añadir acceso a ajustes desde la cabecera)
- Test: `apps/kaizen/src/features/perfil/usar-perfil.test.tsx`

**Interfaces:**
- Consume: `supabase` (Tarea 4), `useSesion` (Tarea 4), componentes (Tarea 8), `TEMAS` (Tarea 7).
- Produce: `usarPerfil(): { perfil: Perfil | null; guardar(cambios: Partial<Perfil>): Promise<void> }`.

- [ ] **Paso 1: Escribir el test que falla**

`src/features/perfil/usar-perfil.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usarPerfil } from './usar-perfil'

const update = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/datos/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ single: () => Promise.resolve({
        data: { id: 'u1', zona_horaria: 'Europe/Madrid', corte_dia: 4, hora_silencio: 22 },
        error: null,
      }) }),
      update: (cambios: unknown) => ({ eq: () => update(cambios) }),
    }),
  },
}))
jest.mock('@/datos/sesion', () => ({ useSesion: () => ({ sesion: { user: { id: 'u1' } }, cargando: false }) }))

function envoltorio({ children }: { children: React.ReactNode }) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}

it('carga el perfil del usuario', async () => {
  const { result } = renderHook(() => usarPerfil(), { wrapper: envoltorio })
  await waitFor(() => expect(result.current.perfil?.corte_dia).toBe(4))
})

it('guarda solo los campos que cambian', async () => {
  const { result } = renderHook(() => usarPerfil(), { wrapper: envoltorio })
  await waitFor(() => expect(result.current.perfil).not.toBeNull())
  await act(() => result.current.guardar({ corte_dia: 6 }))
  expect(update).toHaveBeenCalledWith({ corte_dia: 6 })
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- usar-perfil.test`
Esperado: FALLA con «Cannot find module './usar-perfil'».

- [ ] **Paso 3: Implementar el hook**

`src/features/perfil/usar-perfil.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'

export type Perfil = {
  id: string
  nombre: string
  unidades: string
  zona_horaria: string
  corte_dia: number
  hora_silencio: number
}

export function usarPerfil() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const clienteConsultas = useQueryClient()

  const consulta = useQuery({
    queryKey: ['perfil', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('perfiles').select('*').single()
      if (error) throw new Error(error.message)
      return data as Perfil
    },
  })

  const mutacion = useMutation({
    mutationFn: async (cambios: Partial<Perfil>) => {
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id!)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['perfil', id] }),
  })

  return {
    perfil: consulta.data ?? null,
    guardar: (cambios: Partial<Perfil>) => mutacion.mutateAsync(cambios),
  }
}
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- usar-perfil.test` → PASA

- [ ] **Paso 5: Implementar la pantalla de ajustes**

`src/features/perfil/ajustes.tsx` — cuatro controles sobre `usarPerfil().guardar`, más el selector de tema y el acceso a borrar cuenta de la Tarea 10:

- **Unidades** — métrico / imperial
- **Zona horaria** — detectada con `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable
- **Corte de día** — selector de 0 a 12, con el texto explicativo: «Lo que registres antes de esta hora contará como el día anterior.»
- **Hora de silencio** — selector de 0 a 23, con el texto: «No te avisaremos después de esta hora.»
- **Tema** — una fila por cada clave de `TEMAS`

Todo con los componentes de la Tarea 8. Ningún color escrito a mano.

- [ ] **Paso 6: Ejecutar la comprobación completa**

Ejecutar: `npm test` → todo PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 7: Comitear**

```bash
git add apps/kaizen/src/features/perfil apps/kaizen/src/app
git commit -m "feat(kaizen): perfil y ajustes con zona horaria, corte de dia y tema"
```

---

## Verificación final del bloque 0

Los tests en verde no bastan (spec §14.3). Antes de dar el bloque por terminado:

- [ ] **Recorrido manual en dispositivo.** Arrancar con `npm run dev` y abrir en Expo Go o en una build de desarrollo: crear una cuenta, salir, volver a entrar, recorrer las cinco pestañas, abrir la hoja del +, cerrarla, entrar en ajustes, **cambiar de tema oscuro a claro y comprobar que no queda ni un elemento con el color del tema anterior**, y borrar la cuenta.
- [ ] **Prueba sin conexión.** Poner el móvil en modo avión, insertar un registro de agua desde una pantalla de prueba, reactivar la red y comprobar en Supabase que llegó **una sola** fila.
- [ ] **Configurar los dos perfiles de EAS.** `eas.json` con `tienda` y `personal`, y `.gitignore` con el directorio del skin.
- [ ] **Build real de EAS.** `eas build --profile tienda --platform ios`. Que `tsc` y los tests estén limpios no demuestra que la app compile para iOS.

Solo cuando estos cuatro puntos estén hechos se pasa al plan del bloque 1.
