import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

// Las seis rutas de destino (buscar alimento, escanear código, entrada
// rápida, agua, entrenamiento, peso) se crean en el bloque 1. Hasta entonces
// todas apuntan a "/" para no navegar a una pantalla que no existe: las
// entradas quedan visibles y funcionales, sin opciones deshabilitadas ni
// «próximamente».
const OPCIONES = [
  { clave: 'buscar',   titulo: 'Buscar alimento', ruta: '/' },
  { clave: 'escanear', titulo: 'Escanear código', ruta: '/' },
  { clave: 'rapida',   titulo: 'Entrada rápida', ruta: '/' },
  { clave: 'agua',     titulo: 'Agua', ruta: '/' },
  { clave: 'entreno',  titulo: 'Entrenamiento', ruta: '/' },
  { clave: 'peso',     titulo: 'Peso', ruta: '/' },
] as const

export default function Anadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <View style={{ flex: 1, padding: t.espaciado[3], gap: t.espaciado[1] }}>
      <Texto variante="etiqueta">Añadir</Texto>
      {OPCIONES.map((o) => (
        <Pressable
          key={o.clave}
          accessibilityRole="button"
          onPress={() => router.replace(o.ruta)}
          style={{ paddingVertical: t.espaciado[3] }}
        >
          <Texto>{o.titulo}</Texto>
        </Pressable>
      ))}
    </View>
  )
}
