import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { supabase } from './supabase'
import { CLAVE_MUTACION_GUARDAR_PERFIL, CLAVE_MUTACION_ANADIR_AGUA } from './claves-mutacion'

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((estado) => setOnline(!!estado.isConnected)),
)

export function crearClienteConsultas(): QueryClient {
  const clienteConsultas = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 1000 * 60 * 60 * 24, retry: 2 },
      mutations: { retry: 3, networkMode: 'offlineFirst' },
    },
  })

  // Debe registrarse aquí, de forma síncrona al crear el cliente, y ANTES de
  // que `PersistQueryClientProvider` rehidrate el estado persistido (ver
  // `src/app/_layout.tsx`). Si se registrara dentro de un componente que se
  // monta después, la rehidratación podría llegar antes y la mutación
  // reconstruida se quedaría sin función igualmente. Este mutationFn no
  // puede apoyarse en el `id` de sesión de ningún hook —se ejecuta sin que
  // ningún componente esté montado, potencialmente tras reabrir la app—, así
  // que resuelve su propia sesión antes de escribir.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_GUARDAR_PERFIL, {
    mutationFn: async ({ id, cambios }: { id: string; cambios: Record<string, unknown> }) => {
      // `id` es el dueño que encoló el cambio (viaja en las variables
      // persistidas, ver `usar-perfil.ts`) — NO la sesión activa ahora
      // mismo. Sin esta comprobación: el usuario A encola un cambio sin
      // conexión, su sesión caduca (esa salida no pasa por
      // `purgarCacheLocal`, que solo corre en cerrar-sesión y borrar-cuenta),
      // entra B en el mismo dispositivo, y al recuperar red esto escribiría
      // los campos de A sobre la fila de B con el token de B — RLS no lo
      // frena porque, desde el punto de vista de B, es una escritura propia
      // y legítima.
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesión activa para reanudar este cambio de ajustes.')
      if (idActual !== id) {
        // `resumePausedMutations()` traga este rechazo con un `.catch(noop)`
        // interno (ver `mutationCache.js` de la propia librería instalada):
        // nada en pantalla va a mostrar este mensaje hoy. El estado de la
        // mutación sí queda en "error" para quien la inspeccione, y el
        // `console.error` es la única señal que sobrevive a ese catch —
        // aborta de forma visible, no como un fallo silencioso más.
        console.error(
          '[kaizen] Cambio de ajustes descartado al reanudar: la sesión activa ya no es la que lo encoló.',
        )
        throw new Error('La sesión ha cambiado desde que se encoló este cambio de ajustes.')
      }
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
      if (error) throw new Error(error.message)
    },
  })

  // Mismo razonamiento que arriba, y misma comprobación de dueño: un vaso de
  // agua registrado sin conexión se reproduce cuando vuelve la red, quizá tras
  // reabrir la app y quizá con otra persona dentro. Escribirlo entonces con el
  // token de quien esté ahora le metería agua ajena en su día, y RLS no lo
  // frena porque desde su punto de vista es una escritura propia.
  //
  // El `upsert` con `ignoreDuplicates` es lo que hace seguro reintentar: si la
  // petición original llegó y solo se perdió su respuesta, la fila ya existe
  // con ese mismo `id` generado en el dispositivo y no se duplica.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_ANADIR_AGUA, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar este registro de agua.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Registro de agua descartado al reanudar: la sesion activa ya no es la que lo encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo este registro de agua.')
      }
      const { error } = await supabase
        .from('registros_agua')
        .upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  })

  return clienteConsultas
}

export const persistidor = createAsyncStoragePersister({ storage: AsyncStorage })

/**
 * Purga la caché local de React Query: el estado en memoria (`clear`) y la
 * copia en disco que escribe el persistidor (`removeClient`). Sin las dos
 * llamadas, el JSON del perfil anterior —nombre, unidades, zona horaria,
 * tema— sigue siendo legible en el dispositivo hasta que se reinstale la
 * app. Se llama en los dos caminos que terminan una sesión: cerrar sesión
 * desde Ajustes y el `signOut()` que sigue al borrado de cuenta.
 */
export async function purgarCacheLocal(clienteConsultas: QueryClient): Promise<void> {
  clienteConsultas.clear()
  await persistidor.removeClient()
}
