import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Nutricion() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Nutrición</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Aquí verás tu histórico de comidas. Empieza registrando algo desde el
        botón +.
      </Texto>
    </View>
  )
}
