import { View } from 'react-native'
import { useTema } from '../proveedor'

export function Barra({ progreso, color, alto = 7 }:
  { progreso: number; color: string; alto?: number }) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))

  if (t.recetas.barra === 'segmentada') {
    const total = 10
    const llenos = Math.round(recortado * total)
    return (
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View testID="barra-relleno" style={{ width: `${recortado * 100}%`, flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={{
              flex: 1, height: alto, borderRadius: 2,
              backgroundColor: i < llenos ? color : t.color.pista,
            }} />
          ))}
        </View>
      </View>
    )
  }

  return (
    <View style={{ height: alto, borderRadius: alto, backgroundColor: t.color.pista, overflow: 'hidden' }}>
      <View testID="barra-relleno"
            style={{ width: `${recortado * 100}%`, height: '100%', borderRadius: alto, backgroundColor: color }} />
    </View>
  )
}
