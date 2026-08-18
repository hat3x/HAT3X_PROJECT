import { Tabs, useRouter } from 'expo-router'
import { Pressable, useWindowDimensions, Image } from 'react-native'
import { useContext } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Superficie } from '@/design/componentes/superficie'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

// Disposición, no tema: cuánto mide el botón central y cuánto sobresale de la
// barra. No hay token para esto porque no es «look», es geometría de esta barra.
const LADO_MAS = 52
const SOBRESALIENTE_MAS = 18

// Dos pestañas a cada lado del botón +, no tres y dos. Con cinco celdas del
// mismo ancho, el hueco del centro cae justo en el 50% de la barra y el botón
// queda centrado sin compensar nada.
//
// Coach sale de la barra por eso —era la quinta y descuadraba el reparto— pero
// la pantalla sigue existiendo: `href: null` la quita del menú sin borrar la
// ruta, y se entra desde el mensaje del coach en el Home, que es donde el
// usuario ya lo lee. Se prefirió a ensanchar las pestañas de la izquierda:
// eso centraba el botón pero dejaba «Hoy» y «Nutrición» separadas 176 px
// frente a los 117 px de las otras, y se notaba.

/**
 * Proporción del arte de la barra, para poder darle su altura exacta.
 *
 * Cuando la piel trae barra ilustrada, su alto NO puede ser los 49 pt de
 * siempre: los cinco huecos y el círculo central están dibujados a una
 * proporción concreta, y con cualquier otra altura la imagen se deforma y los
 * iconos dejan de caer dentro de sus huecos.
 */
function proporcionBarra(fondo: ReturnType<typeof useTema>['superficie']['barraInferior']) {
  if (fondo.tipo !== 'recurso' || fondo.recuadro !== null) return null
  const fuente = fondo.fuente
  if (typeof fuente === 'object' && fuente !== null && !Array.isArray(fuente)) {
    const posible = fuente as { width?: number; height?: number }
    if (posible.width && posible.height) return posible.width / posible.height
  }
  const resuelto = Image.resolveAssetSource?.(fuente)
  return resuelto?.width && resuelto?.height ? resuelto.width / resuelto.height : null
}

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
        // Solo sobresale cuando NO hay arte: con la barra ilustrada, el
        // circulo ya esta dibujado y el boton va dentro, no encima.
        marginTop: t.superficie.barraInferior.tipo === 'recurso' ? 0 : -SOBRESALIENTE_MAS,
      }}
    >
      <Texto variante="titulo" style={{ color: t.color.sobreAcento }}>+</Texto>
    </Pressable>
  )
}

export default function LayoutPestanas() {
  const t = useTema()
  const { width } = useWindowDimensions()
  const margen = useContext(SafeAreaInsetsContext)

  // Con arte, el alto sale de la proporción de la imagen; sin arte, se deja el
  // de react-navigation. Se suma el margen inferior del dispositivo porque la
  // barra va en `position: absolute` y nadie lo hace por ella.
  const proporcion = proporcionBarra(t.superficie.barraInferior)
  const altoBarra = proporcion ? width / proporcion + (margen?.bottom ?? 0) : undefined

  // El contenido va DENTRO de los huecos del arte, que empiezan al 19% del alto
  // de la imagen y acaban al 79%. Sin este empujón, react-navigation coloca
  // icono y etiqueta pegados arriba y el icono queda cortado por el canto de la
  // barra: se ve la mitad de la taza y la mitad del sol.
  const dentroDelHueco = altoBarra ? { paddingTop: (altoBarra - (margen?.bottom ?? 0)) * 0.14 } : null

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.acento,
        tabBarInactiveTintColor: t.color.textoTenue,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          ...(altoBarra ? { height: altoBarra, paddingBottom: margen?.bottom ?? 0 } : null),
        },
        ...(dentroDelHueco ? { tabBarItemStyle: dentroDelHueco } : null),
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
          tabBarItemStyle: { alignItems: 'center', justifyContent: 'center', ...dentroDelHueco },
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
      {/* Fuera de la barra, pero la ruta sigue viva: se entra desde el Home. */}
      <Tabs.Screen name="coach" options={{ href: null }} />
    </Tabs>
  )
}
