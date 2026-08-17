import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Entrenamiento() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Entreno</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Tus entrenamientos aparecerán aquí en cuanto registres el primero.
      </Texto>
    </View>
  )
}
