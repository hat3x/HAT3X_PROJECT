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

- [ ] **Paso 5: Escribir el test unitario que sí llama a `insertarIdempotente`**

El test de integración del paso siguiente prueba el mecanismo de Postgres, pero **reimplementa la llamada a mano y nunca pasa por la función**. Si alguien quitara `ignoreDuplicates` de `insertarIdempotente`, el comportamiento cambiaría de «descartar el segundo intento» a «sobrescribir con el segundo», el recuento de filas seguiría siendo uno, TypeScript no diría nada —es un valor, no una clave mal escrita— y ningún test se pondría rojo.

`src/datos/mutacion.test.ts`, añadiendo al fichero:

```ts
import { insertarIdempotente } from './mutacion'

const upsert = jest.fn()
jest.mock('./supabase', () => ({
  supabase: { from: (tabla: string) => ({ upsert: (...a: unknown[]) => upsert(tabla, ...a) }) },
}))

describe('insertarIdempotente', () => {
  beforeEach(() => upsert.mockReset())

  it('inserta descartando el duplicado, no sobrescribiéndolo', async () => {
    upsert.mockResolvedValue({ error: null })
    await insertarIdempotente('registros_agua', { id: 'abc', ml: 250 })
    expect(upsert).toHaveBeenCalledWith(
      'registros_agua',
      { id: 'abc', ml: 250 },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  })

  it('convierte el error de Supabase en una excepción', async () => {
    upsert.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(insertarIdempotente('pesos', { id: 'abc' })).rejects.toThrow('permission denied')
  })
})
```

El primer test es el que importa: fija `ignoreDuplicates: true` como parte del contrato. Sin él, la diferencia entre descartar y sobrescribir es invisible.

- [ ] **Paso 6: Escribir el test de integración de idempotencia**

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

