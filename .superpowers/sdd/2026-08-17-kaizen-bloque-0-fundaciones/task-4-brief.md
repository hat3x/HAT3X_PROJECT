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

