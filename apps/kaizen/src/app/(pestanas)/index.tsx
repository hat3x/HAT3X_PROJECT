import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Hoy() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Hola</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Este es el resumen de tu día. Todavía no hay nada registrado: usa el
        botón + para empezar.
      </Texto>
    </View>
  )
}
