import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Coach() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Coach</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Todavía no tengo datos suficientes sobre ti. Registra unos días y aquí
        empezaré a decirte cosas que valgan la pena.
      </Texto>
    </View>
  )
}
