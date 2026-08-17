import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { supabase } from './supabase'
import { CLAVE_MUTACION_GUARDAR_PERFIL } from './claves-mutacion'

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
    mutationFn: async (cambios: Record<string, unknown>) => {
      const { data } = await supabase.auth.getSession()
      const id = data.session?.user.id
      if (!id) throw new Error('No hay sesión activa para guardar los ajustes.')
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
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
