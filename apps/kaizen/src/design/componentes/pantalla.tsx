import { View, type ViewStyle } from 'react-native'
import { useContext, type ReactNode } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'
import { Aurora } from './aurora'

// Sin margen seguro que aplicar: cero en las cuatro direcciones, ni negativo
// ni inventado, hasta que el proveedor real entregue el suyo. Se exporta
// para que otras pantallas que también consuman `SafeAreaInsetsContext`
// directamente (p.ej. el Home, para no tapar su última tarjeta con la barra
// de pestañas flotante) usen el mismo valor por defecto, no uno duplicado.
export const SIN_MARGEN = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Raíz de toda pantalla. Pinta el fondo del tema, su velo, y aparta el
 * contenido del margen seguro superior (barra de estado / notch) para que
 * ninguna pantalla tenga que resolverlo por su cuenta.
 *
 * Se consume `SafeAreaInsetsContext` directamente en vez del hook
 * `useSafeAreaInsets`: ese hook lanza si no hay `SafeAreaProvider` por
 * encima, y buena parte del suite monta `Pantalla` suelta, sin navegador.
 * Fuera de un proveedor (o en el instante antes de que resuelva) se usa
 * margen cero; en la app real expo-router siempre envuelve la navegación en
 * `SafeAreaProvider`, así que el valor de verdad llega en cuanto existe.
 *
 * El fondo y el velo se pintan a pantalla completa por debajo del margen: es
 * el CONTENIDO (`children`) el que se aparta, no el color que hay detrás.
 */
export function Pantalla({ style, children }: { style?: ViewStyle; children?: ReactNode }) {
  const t = useTema()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN
  return (
    <Superficie fondo={t.fondo.pantalla} radio={0} style={{ flex: 1 }}>
      {/* Antes que nada: la aurora va detrás del contenido y delante del
          fondo, para que el cristal de las tarjetas tenga color que recoger. */}
      <Aurora />
      <View
        testID="pantalla-velo"
        style={{ flex: 1, backgroundColor: t.fondo.velo, paddingTop: margen.top }}
      >
        <View style={[{ flex: 1 }, style]}>{children}</View>
      </View>
    </Superficie>
  )
}
