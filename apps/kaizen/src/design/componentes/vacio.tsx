import { View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { Texto } from './texto'
import { Superficie } from './superficie'
import { useTema } from '../proveedor'

// Geometría de este componente, no del tema: el disco que rodea al icono y el
// icono dentro. Mismo criterio que `LADO_MAS` en el layout de pestañas.
const LADO_DISCO = 88
const TAMANO_ICONO = 32

// Un texto centrado que cruza toda la pantalla se lee fatal: el ojo pierde el
// principio del renglón siguiente. Se corta antes de llegar a los bordes.
const ANCHO_MAXIMO_MENSAJE = 260

/**
 * Lo que se ve en una pantalla que todavía no tiene nada que enseñar.
 *
 * Las cuatro pestañas repetían un título y una línea gris pegados arriba, con
 * el 85% de la pantalla en negro. No estaba roto, pero se leía como una app a
 * medio hacer. Aquí el hueco se convierte en composición: el mensaje va
 * centrado en el espacio que sobra, con el icono de la propia sección dentro de
 * un disco de cristal, que es lo que ata la pantalla vacía al resto del
 * lenguaje visual en vez de dejarla como un aviso suelto.
 */
export function Vacio({ icono, mensaje }: {
  icono: React.ComponentProps<typeof Feather>['name']
  mensaje: string
}) {
  const t = useTema()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.espaciado[4] }}>
      <Superficie
        fondo={t.superficie.tarjeta}
        radio={LADO_DISCO / 2} // círculo: derivado del lado, no un radio inventado
        style={{
          width: LADO_DISCO,
          height: LADO_DISCO,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icono} size={TAMANO_ICONO} color={t.color.acento} />
      </Superficie>
      <Texto
        variante="tenue"
        style={{ textAlign: 'center', maxWidth: ANCHO_MAXIMO_MENSAJE }}
      >
        {mensaje}
      </Texto>
    </View>
  )
}
