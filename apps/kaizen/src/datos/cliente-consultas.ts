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
