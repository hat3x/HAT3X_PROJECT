import { Image } from 'react-native'
import type { Tema } from './tema'

/**
 * Alto de la barra inferior, sin contar el margen seguro del dispositivo.
 *
 * Sin arte son los 49 pt que fija react-navigation (variante uikit, ver
 * `expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`).
 *
 * Con arte lo manda la proporción del PNG: los huecos y el círculo central
 * están dibujados a una proporción concreta y con cualquier otra altura la
 * imagen se deforma.
 *
 * Vive aquí, y no repetido en cada pantalla, porque lo necesitan DOS sitios: el
 * layout de pestañas para dar alto a la barra, y el Home para reservar hueco
 * abajo. Estaba escrito a mano en los dos, y al crecer la barra con el arte el
 * Home siguió reservando 49 pt: la última tarjeta quedó debajo de la barra.
 */
export const ALTO_BARRA_SIN_ARTE = 49

export function altoBarra(tema: Tema, anchoPantalla: number): number {
  const fondo = tema.superficie.barraInferior
  if (fondo.tipo !== 'recurso' || fondo.recuadro !== null) return ALTO_BARRA_SIN_ARTE

  const fuente = fondo.fuente
  if (typeof fuente === 'object' && fuente !== null && !Array.isArray(fuente)) {
    const posible = fuente as { width?: number; height?: number }
    if (posible.width && posible.height) return anchoPantalla / (posible.width / posible.height)
  }
  const resuelto = Image.resolveAssetSource?.(fuente)
  if (resuelto?.width && resuelto?.height) return anchoPantalla / (resuelto.width / resuelto.height)
  return ALTO_BARRA_SIN_ARTE
}
