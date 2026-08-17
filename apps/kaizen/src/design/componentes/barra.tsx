import { View } from 'react-native'
import { useTema } from '../proveedor'

export function Barra({ progreso, color, alto = 7 }:
  { progreso: number; color: string; alto?: number }) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))

  const accesibilidad = {
    accessibilityRole: 'progressbar' as const,
    accessibilityValue: { min: 0, max: 100, now: Math.round(recortado * 100) },
  }

  if (t.recetas.barra === 'segmentada') {
    const total = 10
    const llenos = Math.round(recortado * total)
    // El contenedor ocupa el ancho completo y son los segmentos los que se
    // encienden o se apagan. Encoger el contenedor al progreso comprimiría
    // los diez dentro de esa fracción y dejaría el resto de la barra vacío.
    return (
      <View testID="barra-segmentos" {...accesibilidad} style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} testID={i < llenos ? 'segmento-lleno' : 'segmento-vacio'}
                style={{
                  flex: 1, height: alto, borderRadius: 2,
                  backgroundColor: i < llenos ? color : t.color.pista,
                }} />
        ))}
      </View>
    )
  }

  return (
    <View {...accesibilidad}
          style={{ height: alto, borderRadius: alto, backgroundColor: t.color.pista, overflow: 'hidden' }}>
      <View testID="barra-relleno"
            style={{ width: `${recortado * 100}%`, height: '100%', borderRadius: alto, backgroundColor: color }} />
    </View>
  )
}
