import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { useTema } from '@/design/proveedor'

export default function Hoy() {
  const t = useTema()
  const router = useRouter()
  return (
    <Pantalla style={{ padding: t.espaciado[5] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => router.push('/ajustes')}
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
        >
          <Texto variante="etiqueta">Ajustes</Texto>
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Texto variante="titulo">Hola</Texto>
        <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
          Este es el resumen de tu día. Todavía no hay nada registrado: usa el
          botón + para empezar.
        </Texto>
      </View>
    </Pantalla>
  )
}
