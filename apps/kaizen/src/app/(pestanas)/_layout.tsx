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
