import { View, ImageBackground, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import type { Fondo } from '../tema'
import { useTema } from '../proveedor'

export function Superficie({ fondo, radio, style, children }: {
  fondo: Fondo
  radio: number
  style?: ViewStyle
  children?: ReactNode
}) {
  const t = useTema()

  // El borde SOLO se dibuja sobre color y degradado. Cuando el fondo es arte,
  // el marco lo pone la propia imagen: añadirle encima un borde algorítmico
  // que el tema no puede apagar arruinaría cualquier skin ilustrado.
  const base: ViewStyle = { borderRadius: radio, overflow: 'hidden', ...style }
  const conBorde: ViewStyle = { ...base, borderWidth: 1, borderColor: t.color.borde }

  if (fondo.tipo === 'color') {
    return <View style={[conBorde, { backgroundColor: fondo.valor }]}>{children}</View>
  }

  if (fondo.tipo === 'recurso') {
    const r = fondo.recuadro
    return (
      <ImageBackground
        source={fondo.fuente}
        capInsets={r ? { top: r.arriba, left: r.izquierda, bottom: r.abajo, right: r.derecha } : undefined}
        resizeMode="stretch"
        style={base}
        imageStyle={{ borderRadius: radio }}
      >
        {children}
      </ImageBackground>
    )
  }

  return (
    <BlurView
      intensity={t.superficie.desenfoque}
      tint={t.esquema === 'oscuro' ? 'dark' : 'light'}
      style={conBorde}
    >
      {/* Degradado de verdad: pintar solo `desde` haría que el tema declarase
          dos colores y la pantalla mostrase uno. */}
      <LinearGradient colors={[fondo.desde, fondo.hasta]} style={{ flex: 1 }}>
        {children}
      </LinearGradient>
    </BlurView>
  )
}
