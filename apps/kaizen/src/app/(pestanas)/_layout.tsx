import { Tabs, useRouter } from 'expo-router'
import { Pressable, useWindowDimensions, Image } from 'react-native'
import { useContext } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Superficie } from '@/design/componentes/superficie'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'
import { altoBarra, ALTO_BARRA_SIN_ARTE } from '@/design/alto-barra'

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

function BotonAnadir() {
  const t = useTema()
  const router = useRouter()
  const { width } = useWindowDimensions()

  // Con arte propio, el botón ES la bola: se recorta en círculo para que las
  // esquinas del recorte no tapen el aro que la barra ya trae dibujado. El
  // diámetro sale del alto del arte de la barra, no de LADO_MAS: la bola debe
  // llenar el aro central de la ilustración, y ese aro escala con la barra.
  const arte = t.decoracion.botonMas
  if (arte && t.superficie.barraInferior.tipo === 'recurso') {
    const diametro = altoBarra(t, width) * 0.72
    return (
      <Pressable
        onPress={() => router.push('/anadir')}
        accessibilityRole="button"
        accessibilityLabel="Añadir registro"
        style={{ width: diametro, height: diametro, borderRadius: diametro / 2, overflow: 'hidden' }}
      >
        <Image
          source={arte}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      </Pressable>
    )
  }

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
  // de react-navigation.
  const alto = altoBarra(t, width)
  const barra = t.superficie.barraInferior
  const conArte = alto !== ALTO_BARRA_SIN_ARTE && barra.tipo === 'recurso'

  // El contenido va DENTRO de los huecos del arte, que empiezan al 19% del alto
  // de la imagen y acaban al 79%. Sin este empujón, react-navigation coloca
  // icono y etiqueta pegados arriba y el icono queda cortado por el canto de la
  // barra: se ve la mitad de la taza y la mitad del sol.
  const dentroDelHueco = conArte ? { paddingTop: alto * 0.14 } : null

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
          // La barra mide EXACTAMENTE el arte y flota por encima del margen
          // seguro, no lo absorbe. Sumándoselo, el arte se estiraba hasta esa
          // altura y los huecos bajaban: los iconos se salían de sus marcos.
          // Y rellenar esa franja con un color del tema tampoco vale —todos
          // los que hay son semitransparentes y se veía el Home por debajo de
          // la barra. Flotando, bajo la barra queda el fondo ilustrado, que es
          // lo que el arte espera.
          ...(conArte ? { height: alto, bottom: margen?.bottom ?? 0, paddingBottom: 0 } : null),
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
