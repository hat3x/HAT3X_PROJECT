import { Tabs, useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Superficie } from '@/design/componentes/superficie'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

// Disposición, no tema: cuánto mide el botón central y cuánto sobresale de la
// barra. No hay token para esto porque no es «look», es geometría de esta barra.
const LADO_MAS = 52
const SOBRESALIENTE_MAS = 18

function BotonAnadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push('/anadir')}
      accessibilityRole="button"
      accessibilityLabel="Añadir registro"
      style={{
        width: LADO_MAS, height: LADO_MAS,
        borderRadius: LADO_MAS / 2, // círculo: derivado, no un radio inventado
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.color.acento,
        marginTop: -SOBRESALIENTE_MAS,
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoy',
          tabBarIcon: ({ color, size }) => <Feather name="sun" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          title: 'Nutrición',
          tabBarIcon: ({ color, size }) => <Feather name="coffee" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="anadir-hueco"
        options={{
          title: '',
          tabBarButton: () => <BotonAnadir />,
          // `tabBarButton` sustituye por completo al botón por defecto, así
          // que también se salta el `alignItems`/`justifyContent` que ese
          // renderer aplica de serie. Sin fijarlo aquí, el círculo cae
          // pegado a la esquina superior izquierda de su celda en vez de
          // centrado, y el saliente que da `marginTop` en `BotonAnadir`
          // queda descuadrado respecto a la barra en vez de flotar centrado
          // sobre ella.
          tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' },
        }}
      />
      <Tabs.Screen
        name="entrenamiento"
        options={{
          title: 'Entreno',
          tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="evolucion"
        options={{
          title: 'Evolución',
          tabBarIcon: ({ color, size }) => <Feather name="trending-up" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
