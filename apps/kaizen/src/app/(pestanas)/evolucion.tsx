import { View, ScrollView } from 'react-native'
import { useContext } from 'react'
import { useWindowDimensions } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { Texto } from '@/design/componentes/texto'
import { Pantalla, SIN_MARGEN } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'
import { altoBarra } from '@/design/alto-barra'
import { usarPeso, type Peso } from '@/features/peso/usar-peso'
import { fechaCorta, variacion, enKg } from '@/dominio/peso'



function Fila({ peso, anterior }: { peso: Peso; anterior: number | undefined }) {
  const t = useTema()
  const cambio = variacion(peso.kg, anterior)
  return (
    <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Texto variante="tenue">{fechaCorta(peso.fecha_local)}</Texto>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.espaciado[2] }}>
          {cambio && <Texto variante="tenue">{cambio}</Texto>}
          <Texto variante="titulo">{enKg(peso.kg)} kg</Texto>
        </View>
      </View>
    </Superficie>
  )
}

export default function Evolucion() {
  const t = useTema()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN
  const { width: anchoPantalla } = useWindowDimensions()
  const peso = usarPeso()

  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Evolución</Texto>

      {peso.historico.length === 0 ? (
        <Vacio
          icono="trending-up"
          mensaje={
            peso.cargando
              ? 'Cargando tu histórico…'
              : 'Registra tu peso desde el botón + y aquí verás cómo cambia.'
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: t.espaciado[3],
            paddingBottom: margen.bottom + altoBarra(t, anchoPantalla) + t.espaciado[5],
            gap: t.espaciado[2],
          }}
        >
          {/* El histórico llega de más nuevo a más viejo, así que «el anterior»
              de cada fila es el SIGUIENTE del array, no el previo. */}
          {peso.historico.map((p, indice) => (
            <Fila key={p.fecha_local} peso={p} anterior={peso.historico[indice + 1]?.kg} />
          ))}
        </ScrollView>
      )}
    </Pantalla>
  )
}
