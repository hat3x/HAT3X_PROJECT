import { View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'

/**
 * Raíz de toda pantalla. Pinta el fondo del tema y su velo, para que ninguna
 * pantalla tenga que saber de qué color es el suyo.
 */
export function Pantalla({ style, children }: { style?: ViewStyle; children?: ReactNode }) {
  const t = useTema()
  return (
    <Superficie fondo={t.fondo.pantalla} radio={0} style={{ flex: 1 }}>
      <View style={[{ flex: 1, backgroundColor: t.fondo.velo }, style]}>{children}</View>
    </Superficie>
  )
}
