import { Stack, Redirect } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ProveedorSesion, useSesion } from '@/datos/sesion'
import { crearClienteConsultas, persistidor } from '@/datos/cliente-consultas'
import { Pantalla } from '@/design/componentes/pantalla'
import { ProveedorTemaDelPerfil } from '@/features/perfil/proveedor-tema-del-perfil'

const cliente = crearClienteConsultas()

function Puerta() {
  const { sesion, cargando } = useSesion()
  // Nunca `null`: sin nada montado se ve el fondo por defecto de React Native
  // —blanco— y en una app oscura eso es un fogonazo en cada arranque lento.
  if (cargando) return <Pantalla />
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
        <ProveedorTemaDelPerfil>
          <Puerta />
        </ProveedorTemaDelPerfil>
      </ProveedorSesion>
    </PersistQueryClientProvider>
  )
}
