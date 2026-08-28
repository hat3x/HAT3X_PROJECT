import { Pressable } from 'react-native'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'
import { Texto } from './texto'

/**
 * El fondo sale de `superficie.botonPrimario`/`botonSecundario`, no de un
 * color: así un tema puede darle arte ilustrado al botón sin que esta
 * pantalla ni ninguna otra tengan que enterarse.
 */
type Tono = 'primario' | 'secundario' | 'peligro'

export function Boton({ titulo, alPulsar, tono = 'primario', deshabilitado = false }:
  { titulo: string; alPulsar: () => void; tono?: Tono; deshabilitado?: boolean }) {
  const t = useTema()
  const fondos: Record<Tono, typeof t.superficie.botonPrimario> = {
    primario: t.superficie.botonPrimario,
    secundario: t.superficie.botonSecundario,
    peligro: t.superficie.botonPeligro,
  }
  const colores: Record<Tono, string> = {
    primario: t.color.sobreAcento,
    secundario: t.color.texto,
    peligro: t.color.sobrePeligro,
  }

  return (
    <Pressable
      onPress={alPulsar}
      accessibilityRole="button"
      disabled={deshabilitado}
      accessibilityState={{ disabled: deshabilitado }}
      style={{ opacity: deshabilitado ? 0.5 : 1 }}
    >
      <Superficie
        fondo={fondos[tono]}
        radio={t.radio.boton}
        style={{
          paddingVertical: t.espaciado[1],
          paddingHorizontal: t.espaciado[2],
          alignItems: 'center',
        }}
      >
        <Texto style={{ color: colores[tono], fontWeight: t.tipografia.pesoTitular }}>
          {titulo}
        </Texto>
      </Superficie>
    </Pressable>
  )
}
