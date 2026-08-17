import { View, ImageBackground, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
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
  const base: ViewStyle = {
    borderRadius: radio,
    borderWidth: 1,
    borderColor: t.color.borde,
    overflow: 'hidden',
    ...style,
  }

  if (fondo.tipo === 'color') {
    return <View style={[base, { backgroundColor: fondo.valor }]}>{children}</View>
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
      style={base}
    >
      <View style={{ backgroundColor: fondo.desde, flex: 1 }}>{children}</View>
    </BlurView>
  )
}
