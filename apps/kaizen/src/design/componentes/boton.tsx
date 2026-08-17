import { Pressable } from 'react-native'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'
import { Texto } from './texto'

/**
 * El fondo sale de `superficie.botonPrimario`/`botonSecundario`, no de un
 * color: así un tema puede darle arte ilustrado al botón sin que esta
 * pantalla ni ninguna otra tengan que enterarse.
 */
export function Boton({ titulo, alPulsar, tono = 'primario' }:
  { titulo: string; alPulsar: () => void; tono?: 'primario' | 'secundario' }) {
  const t = useTema()
  const primario = tono === 'primario'
  const fondo = primario ? t.superficie.botonPrimario : t.superficie.botonSecundario

  return (
    <Pressable onPress={alPulsar} accessibilityRole="button">
      <Superficie
        fondo={fondo}
        radio={t.radio.boton}
        style={{
          paddingVertical: t.espaciado[1],
          paddingHorizontal: t.espaciado[2],
          alignItems: 'center',
        }}
      >
        <Texto style={{
          color: primario ? t.color.sobreAcento : t.color.texto,
          fontWeight: t.tipografia.pesoTitular,
        }}>
          {titulo}
        </Texto>
      </Superficie>
    </Pressable>
  )
}
