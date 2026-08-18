import { Stack, Redirect, Slot } from 'expo-router'
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
  if (!sesion) {
    // El layout raíz SIEMPRE tiene que renderizar un navegador de expo-router
    // para que la ruta a la que redirige pueda montarse. `return <Redirect
    // .../>` a secas no renderiza ningún navegador: el árbol queda sin
    // resolver para siempre. Reproducido, no razonado: monta así y el
    // proceso agota los 4 GB de heap con «Ineffective mark-compacts near
    // heap limit»; con `<Slot/>` conviviendo con el `<Redirect/>`, verde en
    // 50 ms. Pasa en el primer arranque sin sesión y justo después de
    // borrar la cuenta, porque el `signOut()` de esa pantalla dispara esta
    // misma rama.
    return (
      <>
        <Redirect href="/acceso" />
        <Slot />
      </>
    )
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(pestanas)" />
      <Stack.Screen name="anadir" options={{ presentation: 'modal' }} />
      {/* Las cinco se abren como modal: son gestos cortos —registrar algo y
          volver—, no destinos donde uno se queda. Sin declararlas aqui la ruta
          existe igual, porque expo-router la crea del fichero, pero se abre
          como una pantalla normal. Estuvo asi un rato y no se noto: el fichero
          se veia bien y la app tambien. */}
      <Stack.Screen name="registrar-peso" options={{ presentation: 'modal' }} />
      <Stack.Screen name="registrar-entrenamiento" options={{ presentation: 'modal' }} />
      <Stack.Screen name="entrada-rapida" options={{ presentation: 'modal' }} />
      <Stack.Screen name="buscar-alimento" options={{ presentation: 'modal' }} />
      <Stack.Screen name="alta" options={{ presentation: 'modal' }} />
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
