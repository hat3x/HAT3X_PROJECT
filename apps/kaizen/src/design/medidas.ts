import { Image, type ImageSourcePropType } from 'react-native'

/**
 * Las medidas originales de una imagen empaquetada.
 *
 * `Image.resolveAssetSource` NO existe en React Native Web —revienta con «is
 * not a function»—, y en web el `require` de una imagen ya devuelve un objeto
 * con `width` y `height`. Se mira primero ahí y solo se llama al método cuando
 * existe. Sin la proporción no se puede dar ancho sin deformar el arte, así que
 * el último recurso es un 2:1, que es la forma de casi todos estos botones.
 *
 * Vive aquí, y no dentro del Home, porque lo necesitan DOS sitios: los botones
 * de arte del Home y el botón central de la barra de pestañas — el mismo
 * motivo por el que `altoBarra` tiene su propio fichero.
 */
export function medidasDe(fuente: ImageSourcePropType): { width: number; height: number } {
  if (typeof fuente === 'object' && fuente !== null && !Array.isArray(fuente)) {
    const posible = fuente as { width?: number; height?: number }
    if (posible.width && posible.height) return { width: posible.width, height: posible.height }
  }
  const resuelto = Image.resolveAssetSource?.(fuente)
  if (resuelto?.width && resuelto?.height) return { width: resuelto.width, height: resuelto.height }
  return { width: 2, height: 1 }
}
