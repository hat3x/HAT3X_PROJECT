import { useState, type ReactNode } from 'react'
import { View, Pressable, Image, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { Superficie } from './superficie'
import { useTema } from '../proveedor'
import type { TarjetaIlustrada } from '../tema'

/**
 * Una tarjeta del Home, con o sin arte.
 *
 * Sin arte es una `Superficie` normal con su padding. Con arte cambian dos
 * cosas, y las dos vienen impuestas por la ilustración:
 *
 * 1. **El contenido no ocupa toda la tarjeta.** El marco trae dibujos fijos a
 *    los lados —una gota, el edificio de Capsule Corp, una bola de dragón— y
 *    el texto tiene que caer en el hueco de en medio. Si no, se escribe encima
 *    del dibujo.
 * 2. **Algunos botones ya están pintados dentro.** El «+250» y el «Registrar»
 *    son parte de la imagen, así que no se dibuja un botón encima —saldría dos
 *    veces— sino una zona transparente que escucha el toque justo ahí.
 *
 * Las dos cosas van en fracción del ancho, porque la misma imagen se estira a
 * cualquier pantalla. De ahí el `onLayout`: hasta que no se mide la tarjeta no
 * se sabe cuántos puntos son esas fracciones.
 */
/**
 * La proporción de un arte que no se estira.
 *
 * Solo aplica cuando el fondo es una imagen SIN `recuadro`: entonces la tarjeta
 * se escala entera y su altura la manda la imagen. Con `recuadro` la imagen sí
 * se estira, así que la altura la manda el contenido, como en cualquier
 * tarjeta normal.
 *
 * `Image.resolveAssetSource` no existe en React Native Web, y allí el `require`
 * ya devuelve las medidas: se mira primero ahí.
 */
function proporcionDe(fuente: ImageSourcePropType): number | undefined {
  if (typeof fuente === 'object' && fuente !== null && !Array.isArray(fuente)) {
    const posible = fuente as { width?: number; height?: number }
    if (posible.width && posible.height) return posible.width / posible.height
  }
  const resuelto = Image.resolveAssetSource?.(fuente)
  if (resuelto?.width && resuelto?.height) return resuelto.width / resuelto.height
  return undefined
}

export function Tarjeta({ arte, acciones, etiquetas, style, children }: {
  arte: TarjetaIlustrada | null
  /** Una por cada zona pulsable del arte, en el mismo orden. */
  acciones?: (() => void)[]
  /** Lo que anuncia cada zona a un lector de pantalla. Mismo orden. */
  etiquetas?: string[]
  style?: ViewStyle
  children?: ReactNode
}) {
  const t = useTema()
  const [ancho, setAncho] = useState(0)

  if (!arte) {
    return (
      <Superficie
        fondo={t.superficie.tarjeta}
        radio={t.radio.tarjeta}
        style={{ padding: t.espaciado[4], ...style }}
      >
        {children}
      </Superficie>
    )
  }

  const medir = (evento: LayoutChangeEvent) => setAncho(evento.nativeEvent.layout.width)

  const sinEstirar = arte.fondo.tipo === 'recurso' && arte.fondo.recuadro === null
  const proporcion = sinEstirar && arte.fondo.tipo === 'recurso'
    ? proporcionDe(arte.fondo.fuente)
    : undefined

  return (
    <Superficie
      fondo={arte.fondo}
      radio={t.radio.tarjeta}
      style={{ ...(proporcion ? { aspectRatio: proporcion } : null), ...style }}
    >
      <View onLayout={medir} style={{ flex: 1, justifyContent: 'center' }}>
        <View
          style={{
            paddingLeft: ancho * arte.contenido.izquierda,
            paddingRight: ancho * (1 - arte.contenido.derecha),
            ...(proporcion ? null : { paddingVertical: t.espaciado[3] }),
          }}
        >
          {children}
        </View>

        {/* Encima de los botones dibujados. Sin fondo ni borde: lo único que
            aportan es el toque y su etiqueta para el lector de pantalla, que
            de otro modo no encontraría nada pulsable donde se ve un botón. */}
        {ancho > 0 &&
          arte.pulsables.map((zona, indice) => {
            const alPulsar = acciones?.[indice]
            if (!alPulsar) return null
            return (
              <Pressable
                key={indice}
                onPress={alPulsar}
                accessibilityRole="button"
                accessibilityLabel={etiquetas?.[indice]}
                style={{
                  position: 'absolute',
                  left: ancho * zona.desde,
                  width: ancho * (zona.hasta - zona.desde),
                  top: 0,
                  bottom: 0,
                }}
              />
            )
          })}
      </View>
    </Superficie>
  )
}
