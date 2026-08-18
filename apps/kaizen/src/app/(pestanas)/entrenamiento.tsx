import { View, ScrollView } from 'react-native'
import { useContext } from 'react'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { Texto } from '@/design/componentes/texto'
import { Pantalla, SIN_MARGEN } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'
import { usarEntrenamiento, type Entrenamiento } from '@/features/entrenamiento/usar-entrenamiento'
import { tituloDeTipo, enDuracion } from '@/dominio/entrenamiento'
import { fechaCorta } from '@/dominio/peso'

// Misma altura de barra que en el Home y en Evolución, y por el mismo motivo.
const ALTURA_CONTENIDO_BARRA = 49

function Fila({ sesion }: { sesion: Entrenamiento }) {
  const t = useTema()
  return (
    <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Texto>{tituloDeTipo(sesion.tipo)}</Texto>
          <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
            {fechaCorta(sesion.fecha_local)}
          </Texto>
        </View>
        {/* La duración es opcional: sin ella se enseña el tipo y la fecha, no un
            «null min» ni un cero que parecería una sesión de duración nula. */}
        {sesion.duracion_min !== null && (
          <Texto variante="titulo">{enDuracion(sesion.duracion_min)}</Texto>
        )}
      </View>
    </Superficie>
  )
}

export default function EntrenamientoPantalla() {
  const t = useTema()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN
  const entreno = usarEntrenamiento()

  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Entreno</Texto>

      {entreno.historico.length === 0 ? (
        <Vacio
          icono="activity"
          mensaje={
            entreno.cargando
              ? 'Cargando tus entrenamientos…'
              : 'Tus entrenamientos aparecerán aquí en cuanto registres el primero.'
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: t.espaciado[3],
            paddingBottom: margen.bottom + ALTURA_CONTENIDO_BARRA + t.espaciado[5],
            gap: t.espaciado[2],
          }}
        >
          {entreno.historico.map((sesion) => (
            <Fila key={sesion.id} sesion={sesion} />
          ))}
        </ScrollView>
      )}
    </Pantalla>
  )
}
