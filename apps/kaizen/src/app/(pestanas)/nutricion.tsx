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
import { usarNutricion, type ItemComido } from '@/features/nutricion/usar-nutricion'
import { MOMENTOS, tituloDeMomento, sumarMacros, enKcal, enGramos } from '@/dominio/nutricion'


function Renglon({ item }: { item: ItemComido }) {
  const t = useTema()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <View style={{ flex: 1, paddingRight: t.espaciado[2] }}>
        <Texto>{item.nombre}</Texto>
        <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
          {enGramos(item.cantidad_g)} g · {enGramos(item.proteina_g)}P ·{' '}
          {enGramos(item.carbos_g)}C · {enGramos(item.grasas_g)}G
        </Texto>
      </View>
      <Texto>{enKcal(item.kcal)}</Texto>
    </View>
  )
}

export default function Nutricion() {
  const t = useTema()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN
  const { width: anchoPantalla } = useWindowDimensions()
  const nutricion = usarNutricion()

  // Se agrupa por momento en el orden del día, no en el que se registró: quien
  // apunta la cena antes que la comida sigue queriendo leerlas en orden.
  const porMomento = MOMENTOS.map((m) => ({
    clave: m.clave as string,
    titulo: m.titulo as string,
    items: nutricion.items.filter((i) => i.momento === m.clave),
  })).filter((m) => m.items.length > 0)

  // Y lo que no encaje en ninguno —un momento viejo o escrito a mano— no se
  // pierde: se agrupa aparte en vez de desaparecer de la pantalla.
  const claves = MOMENTOS.map((m) => m.clave) as readonly string[]
  const sueltos = nutricion.items.filter((i) => !claves.includes(i.momento))
  const grupos = [
    ...porMomento,
    ...(sueltos.length > 0
      ? [{ clave: 'otros', titulo: tituloDeMomento(sueltos[0]!.momento), items: sueltos }]
      : []),
  ]

  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Nutrición</Texto>

      {nutricion.items.length === 0 ? (
        <Vacio
          icono="coffee"
          mensaje={
            nutricion.cargando
              ? 'Cargando lo de hoy…'
              : 'Aquí verás lo que has comido hoy. Empieza registrando algo desde el botón +.'
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: t.espaciado[3],
            paddingBottom: margen.bottom + altoBarra(t, anchoPantalla) + t.espaciado[5],
            gap: t.espaciado[3],
          }}
        >
          {grupos.map((grupo) => {
            const total = sumarMacros(grupo.items)
            return (
              <Superficie
                key={grupo.clave}
                fondo={t.superficie.tarjeta}
                radio={t.radio.tarjeta}
                style={{ padding: t.espaciado[4] }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Texto variante="etiqueta">{grupo.titulo}</Texto>
                  <Texto variante="tenue">{enKcal(total.kcal)} kcal</Texto>
                </View>
                <View style={{ marginTop: t.espaciado[2], gap: t.espaciado[2] }}>
                  {grupo.items.map((item) => (
                    <Renglon key={item.id} item={item} />
                  ))}
                </View>
              </Superficie>
            )
          })}
        </ScrollView>
      )}
    </Pantalla>
  )
}
