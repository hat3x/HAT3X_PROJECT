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
  tema: string
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
    // Sin estos dos, un fallo al guardar es indistinguible de un éxito: la
    // pantalla no tiene de dónde leerlo y el usuario cree que se guardó.
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError
      ? 'No hemos podido guardar el cambio. Inténtalo de nuevo.'
      : null,
  }
}
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- usar-perfil.test` → PASA

- [ ] **Paso 4bis: Guardar y aplicar el tema elegido**

Sin esto, el selector de tema de la pantalla de ajustes **no cambia nada**: no hay dónde guardar la elección y el proveedor está fijado a `"defecto"` a mano en el layout raíz.

`supabase/migrations/0005_tema_del_perfil.sql`:

```sql
alter table perfiles
  add column tema text not null default 'defecto';
```

Y el layout raíz deja de fijar el tema a mano. `src/app/_layout.tsx`, sustituyendo el `<ProveedorTema nombre="defecto">`:

```tsx
/**
 * Lee el tema del perfil. Antes de iniciar sesión no hay perfil, así que cae
 * al de por defecto — que es justo lo que debe verse en la pantalla de acceso.
 */
function ProveedorTemaDelPerfil({ children }: { children: ReactNode }) {
  const { perfil } = usarPerfil()
  return <ProveedorTema nombre={perfil?.tema ?? 'defecto'}>{children}</ProveedorTema>
}
```

Va **dentro** de `ProveedorSesion` y del proveedor de consultas, porque necesita la sesión y la caché para leer el perfil.

- [ ] **Paso 5: Implementar la pantalla de ajustes**

`src/features/perfil/ajustes.tsx` — cuatro controles sobre `usarPerfil().guardar`, más el selector de tema y el acceso a borrar cuenta de la Tarea 10:

- **Unidades** — métrico / imperial
- **Zona horaria** — detectada con `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable, y **validada antes de guardar** con el mismo mecanismo que después la consume:

  ```ts
  function esZonaValida(valor: string): boolean {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: valor })
      return true
    } catch {
      return false
    }
  }
  ```

  Si no es válida, se avisa y **no se guarda**. Validar con `Intl` y no contra una lista propia es deliberado: si `Intl` la acepta, `fechaLocal` funcionará con ella; si no, el cálculo del día entero se rompería en silencio. Hoy el campo es texto libre y «Europ/Madrid» se guarda sin decir nada, mientras que el corte de día está protegido por dos capas — una asimetría que no se sostiene, siendo los dos el fundamento del mismo cálculo
- **Corte de día** — selector de 0 a 12, con el texto explicativo: «Lo que registres antes de esta hora contará como el día anterior.»
- **Hora de silencio** — selector de 0 a 23, con el texto: «No te avisaremos después de esta hora.»
- **Tema** — una fila por cada clave de `TEMAS`, y al tocarla se llama a `guardar({ tema })`. El cambio tiene que verse **al instante** en la propia pantalla de ajustes: si hay que reiniciar la app para notarlo, está mal cableado

Todo con los componentes de la Tarea 8. Ningún color escrito a mano.

- [ ] **Paso 5bis: El test que protege el criterio central**

El cambio de tema instantáneo es lo que esta tarea existe para entregar, y hoy no hay nada que se ponga rojo si alguien rompe la invalidación de caché, cambia la clave de consulta o desconecta el proveedor del cliente compartido.

`src/features/perfil/tema-instantaneo.test.tsx`:

```tsx
// Prueba la cadena entera menos la red: guardar → invalidar → releer →
// re-renderizar el proveedor → color nuevo en pantalla, sin remontar nada.
it('cambiar el tema se ve al instante, sin reiniciar', async () => {
  render(
    <QueryClientProvider client={cliente}>
      <ProveedorTemaDelPerfil><Sonda /></ProveedorTemaDelPerfil>
    </QueryClientProvider>,
  )

  // Arranca con el tema oscuro guardado en el perfil.
  await waitFor(() =>
    expect(screen.getByText('sonda')).toHaveStyle({ color: temaDefecto.color.texto }))

  // El perfil pasa a tener el tema claro y se guarda.
  perfilFalso.tema = 'claro'
  await act(() => guardarDesdeLaSonda({ tema: 'claro' }))

  // Sin remontar: el mismo nodo tiene ya el color del tema claro.
  await waitFor(() =>
    expect(screen.getByText('sonda')).toHaveStyle({ color: temaClaro.color.texto }))
})
```

`Sonda` es un componente mínimo que pinta un `Texto` y expone `guardar` de `usarPerfil`. El mock de `./supabase` devuelve `perfilFalso` al leer y lo muta al escribir, para que el refresco tras invalidar traiga el valor nuevo.

**Verifica que puede fallar**: quita el `invalidateQueries` del `onSuccess` del hook, comprueba que el test se pone rojo, y devuélvelo. Si no se pone rojo, no está probando la cadena.

- [ ] **Paso 6: Ejecutar la comprobación completa**

Ejecutar: `npm test` → todo PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 7: Comitear**

```bash
git add apps/kaizen/src/features/perfil apps/kaizen/src/app
git commit -m "feat(kaizen): perfil y ajustes con zona horaria, corte de dia y tema"
```

---

