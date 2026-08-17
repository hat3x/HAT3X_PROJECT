import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Evolucion() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Evolución</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Cuando lleves unas semanas registrando, aquí verás cómo has cambiado.
      </Texto>
    </View>
  )
}
