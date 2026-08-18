import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'

// Geometría de esta lista, no del tema: mismo criterio que
// `TAMANO_ICONO_MISION` en el Home y `LADO_MAS` en el layout de pestañas.
const TAMANO_ICONO = 20

// Las seis rutas de destino (buscar alimento, escanear código, entrada
// rápida, agua, entrenamiento, peso) se crean en el bloque 1. Hasta entonces
// todas apuntan a "/" para no navegar a una pantalla que no existe: las
// entradas quedan visibles y funcionales, sin opciones deshabilitadas ni
// «próximamente».
const OPCIONES = [
  { clave: 'buscar',   titulo: 'Buscar alimento', icono: 'search',      ruta: '/' },
  { clave: 'escanear', titulo: 'Escanear código', icono: 'camera',      ruta: '/' },
  { clave: 'rapida',   titulo: 'Entrada rápida',  icono: 'edit-3',      ruta: '/' },
  { clave: 'agua',     titulo: 'Agua',            icono: 'droplet',     ruta: '/' },
  { clave: 'entreno',  titulo: 'Entrenamiento',   icono: 'activity',    ruta: '/registrar-entrenamiento' },
  { clave: 'peso',     titulo: 'Peso',            icono: 'bar-chart-2', ruta: '/registrar-peso' },
] as const

export default function Anadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <Pantalla style={{ padding: t.espaciado[5], gap: t.espaciado[2] }}>
      <Texto variante="titulo" style={{ marginBottom: t.espaciado[1] }}>Añadir</Texto>
      {OPCIONES.map((o) => (
        <Pressable key={o.clave} accessibilityRole="button" onPress={() => router.replace(o.ruta)}>
          <Superficie
            fondo={t.superficie.tarjeta}
            radio={t.radio.tarjeta}
            style={{ padding: t.espaciado[4] }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[3] }}>
              <Feather name={o.icono} size={TAMANO_ICONO} color={t.color.acento} />
              <Texto style={{ flex: 1 }}>{o.titulo}</Texto>
              <Feather name="chevron-right" size={TAMANO_ICONO} color={t.color.textoTenue} />
            </View>
          </Superficie>
        </Pressable>
      ))}
    </Pantalla>
  )
}
