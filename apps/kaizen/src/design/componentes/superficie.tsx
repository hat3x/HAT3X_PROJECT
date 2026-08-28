import { View, Image, StyleSheet, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import type { Fondo } from '../tema'
import { useTema } from '../proveedor'

export function Superficie({ fondo, radio, style, testID, children }: {
  fondo: Fondo
  radio: number
  style?: ViewStyle
  testID?: string
  children?: ReactNode
}) {
  const t = useTema()

  // El borde SOLO se dibuja sobre color y degradado. Cuando el fondo es arte,
  // el marco lo pone la propia imagen: añadirle encima un borde algorítmico
  // que el tema no puede apagar arruinaría cualquier skin ilustrado.
  const base: ViewStyle = { borderRadius: radio, overflow: 'hidden', ...style }
  const conBorde: ViewStyle = { ...base, borderWidth: 1, borderColor: t.color.borde }

  if (fondo.tipo === 'color') {
    return <View testID={testID} style={[conBorde, { backgroundColor: fondo.valor }]}>{children}</View>
  }

  if (fondo.tipo === 'recurso') {
    const r = fondo.recuadro
    // Misma forma que el degradado, y por el mismo motivo: la imagen va en una
    // capa absoluta DETRAS del contenido, no envolviendolo. Con
    // `ImageBackground` el arte salia recortado en vez de escalado —visto en
    // captura—, porque su altura la decidia el contenido y no el `aspectRatio`
    // del contenedor. Asi la imagen llena siempre exactamente la tarjeta.
    return (
      <View testID={testID} style={base}>
        <Image
          source={fondo.fuente}
          capInsets={r ? { top: r.arriba, left: r.izquierda, bottom: r.abajo, right: r.derecha } : undefined}
          resizeMode="stretch"
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', borderRadius: radio }]}
        />
        {children}
      </View>
    )
  }

  // Las dos capas de fondo van sueltas y en posición absoluta, NO envolviendo
  // al contenido. Envolviéndolo, el `padding` que trae `style` se aplicaba al
  // contenedor y empujaba el fondo hacia dentro: quedaba un rectángulo de
  // esquinas rectas metido dentro del borde redondeado. Se veía así en las
  // cuatro tarjetas del Home y en la barra de pestañas. Sueltas, el padding
  // solo separa el contenido y el fondo llega a los bordes, recortado por el
  // radio gracias al `overflow: 'hidden'` del contenedor.
  //
  // El desenfoque afecta a lo que hay DETRÁS, así que da igual que el
  // degradado sea hermano y no hijo: al ir después, se pinta encima.
  return (
    <View testID={testID} style={conBorde}>
      <BlurView
        intensity={t.superficie.desenfoque}
        tint={t.esquema === 'oscuro' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Degradado de verdad: pintar solo `desde` haría que el tema declarase
          dos colores y la pantalla mostrase uno. */}
      <LinearGradient
        testID="superficie-fondo"
        colors={[fondo.desde, fondo.hasta]}
        style={StyleSheet.absoluteFill}
      />
      {/* El filo de luz del canto superior. Se apaga hacia los lados en vez de
          cruzar de lado a lado: una línea uniforme se lee como un borde
          dibujado, y una que se desvanece, como luz resbalando por un canto.
          Va después del degradado —encima— y antes del contenido. */}
      <LinearGradient
        testID="superficie-especular"
        colors={['transparent', t.color.especular, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth }}
      />
      {children}
    </View>
  )
}
