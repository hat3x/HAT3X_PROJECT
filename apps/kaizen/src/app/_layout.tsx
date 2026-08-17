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
    <PersistQueryClientProvider
      client={cliente}
      persistOptions={{ persister: persistidor }}
      // Rehidratar NO reanuda nada por sí solo: `PersistQueryClientProvider`
      // solo restaura el estado. Sin esta llamada, lo que registraste sin
      // cobertura se guarda y no se envía jamás.
      onSuccess={() => cliente.resumePausedMutations()}
    >
      <ProveedorSesion>
        <ProveedorTema nombre="defecto">
          <Puerta />
        </ProveedorTema>
      </ProveedorSesion>
    </PersistQueryClientProvider>
  )
}
