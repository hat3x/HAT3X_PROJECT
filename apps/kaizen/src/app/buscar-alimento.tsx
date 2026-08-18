import { useState } from 'react'
import { View, TextInput, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'
import { usarNutricion } from '@/features/nutricion/usar-nutricion'
import { usarBusquedaAlimentos } from '@/features/nutricion/usar-busqueda-alimentos'
import { MOMENTOS, porCantidad, leerGramos, enKcal, enGramos, type Momento } from '@/dominio/nutricion'
import type { AlimentoEncontrado } from '@/dominio/open-food-facts'

const TAMANO_ICONO = 20

/** Lo que come la mayoría de la gente de una sentada, como punto de partida. */
const GRAMOS_POR_DEFECTO = '100'

function Resultado({ alimento, alElegir }: {
  alimento: AlimentoEncontrado
  alElegir: () => void
}) {
  const t = useTema()
  const energia = `${enKcal(alimento.kcal_100)} kcal/100 g`
  const subtitulo = alimento.marca ? `${alimento.marca} · ${energia}` : energia

  return (
    <Pressable onPress={alElegir} accessibilityRole="button">
      <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[2] }}>
          <View style={{ flex: 1 }}>
            <Texto>{alimento.nombre}</Texto>
            <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>{subtitulo}</Texto>
          </View>
          <Feather name="chevron-right" size={TAMANO_ICONO} color={t.color.textoTenue} />
        </View>
      </Superficie>
    </Pressable>
  )
}

export default function BuscarAlimento() {
  const t = useTema()
  const router = useRouter()
  const nutricion = usarNutricion()

  const [texto, setTexto] = useState('')
  const busqueda = usarBusquedaAlimentos(texto)

  // Segundo paso: cuando ya has elegido uno, la pantalla pasa a preguntar
  // cuánto. Dos pasos en la misma pantalla y no dos pantallas, porque volver
  // atrás para cambiar de alimento tiene que ser un solo toque.
  const [elegido, setElegido] = useState<AlimentoEncontrado | null>(null)
  const [momento, setMomento] = useState<Momento>('comida')
  const [gramos, setGramos] = useState(GRAMOS_POR_DEFECTO)
  const [error, setError] = useState<string | null>(null)

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  const cantidad = leerGramos(gramos)
  const previsualizacion = elegido && cantidad !== null ? porCantidad(elegido, cantidad) : null

  async function guardar() {
    if (!elegido) return
    if (cantidad === null) {
      setError('Escribe cuántos gramos has comido.')
      return
    }
    if (previsualizacion === null) return
    setError(null)
    await nutricion.registrar({
      momento, nombre: elegido.nombre, cantidad_g: cantidad, ...previsualizacion,
    })
    // Solo se vuelve si se guardó: `mutateAsync` rechaza al fallar.
    router.back()
  }

  if (elegido) {
    const porCien = [
      `${enKcal(elegido.kcal_100)} kcal`,
      `${enGramos(elegido.proteina_100)}P`,
      `${enGramos(elegido.carbos_100)}C`,
      `${enGramos(elegido.grasas_100)}G`,
    ].join(' · ')
    const cabecera = elegido.marca ? `${elegido.marca} · ${porCien}` : porCien

    return (
      <Pantalla>
        <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[4] }}>
          <View>
            <Texto variante="titulo">{elegido.nombre}</Texto>
            <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
              {cabecera} por 100 g
            </Texto>
          </View>

          <View style={{ gap: t.espaciado[1] }}>
            <Texto variante="etiqueta">Momento</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.espaciado[1] }}>
              {MOMENTOS.map((opcion) => (
                <Boton
                  key={opcion.clave}
                  titulo={opcion.titulo}
                  tono={momento === opcion.clave ? 'primario' : 'secundario'}
                  deshabilitado={nutricion.guardando}
                  alPulsar={() => setMomento(opcion.clave)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: t.espaciado[1] }}>
            <Texto variante="etiqueta">Cantidad (g)</Texto>
            <TextInput
              style={campo}
              value={gramos}
              onChangeText={(valor) => { setGramos(valor); setError(null) }}
              keyboardType="decimal-pad"
              editable={!nutricion.guardando}
              autoFocus
            />
          </View>

          {previsualizacion && (
            <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
              <Texto variante="etiqueta">Se registrará</Texto>
              <Texto variante="titulo" style={{ marginTop: t.espaciado[0] }}>
                {enKcal(previsualizacion.kcal)} kcal
              </Texto>
              <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
                {enGramos(previsualizacion.proteina_g)} g proteína ·{' '}
                {enGramos(previsualizacion.carbos_g)} g carbos ·{' '}
                {enGramos(previsualizacion.grasas_g)} g grasas
              </Texto>
            </Superficie>
          )}

          {(error || nutricion.errorAlGuardar) && (
            <Texto variante="tenue" style={{ color: t.color.peligro }}>
              {error ?? nutricion.errorAlGuardar}
            </Texto>
          )}

          <View style={{ gap: t.espaciado[1] }}>
            <Boton
              titulo={nutricion.guardando ? 'Guardando…' : 'Guardar'}
              deshabilitado={nutricion.guardando}
              alPulsar={guardar}
            />
            <Boton titulo="Elegir otro" tono="secundario" alPulsar={() => setElegido(null)} />
          </View>
        </ScrollView>
      </Pantalla>
    )
  }

  const sinResultados = busqueda.resultados.length === 0 && !busqueda.error

  return (
    <Pantalla style={{ padding: t.espaciado[5], gap: t.espaciado[3] }}>
      <Texto variante="titulo">Buscar alimento</Texto>

      <TextInput
        style={campo}
        value={texto}
        onChangeText={setTexto}
        placeholder="Yogur griego, avena, pollo…"
        placeholderTextColor={t.color.textoTenue}
        autoFocus
        autoCorrect={false}
      />

      {busqueda.error && (
        <Texto variante="tenue" style={{ color: t.color.peligro }}>{busqueda.error}</Texto>
      )}

      {!busqueda.hayConsulta ? (
        <Vacio
          icono="search"
          mensaje={`Escribe al menos ${busqueda.minimoLetras} letras. Los alimentos vienen de Open Food Facts, una base abierta y colaborativa.`}
        />
      ) : busqueda.buscando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.color.acento} />
        </View>
      ) : sinResultados ? (
        <Vacio
          icono="search"
          mensaje="No hemos encontrado nada con eso. Prueba con otro nombre, o regístralo con la entrada rápida."
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          // Sin esto, el primer toque en un resultado solo cierra el teclado y
          // hay que tocar dos veces para elegir.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: t.espaciado[2], paddingBottom: t.espaciado[5] }}
        >
          {busqueda.resultados.map((alimento) => (
            <Resultado
              key={alimento.codigo}
              alimento={alimento}
              alElegir={() => {
                setElegido(alimento)
                setGramos(GRAMOS_POR_DEFECTO)
                setError(null)
              }}
            />
          ))}
        </ScrollView>
      )}

      <Boton titulo="Cancelar" tono="secundario" alPulsar={() => router.back()} />
    </Pantalla>
  )
}
