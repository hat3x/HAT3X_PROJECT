import { useState } from 'react'
import { View, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'
import { usarNutricion } from '@/features/nutricion/usar-nutricion'
import {
  MOMENTOS, porCantidad, leerGramos, leerNumero, enKcal, enGramos,
  type Momento,
} from '@/dominio/nutricion'

export default function EntradaRapida() {
  const t = useTema()
  const router = useRouter()
  const nutricion = usarNutricion()

  const [momento, setMomento] = useState<Momento>('comida')
  const [nombre, setNombre] = useState('')
  const [gramos, setGramos] = useState('')
  const [kcal100, setKcal100] = useState('')
  const [proteina100, setProteina100] = useState('')
  const [carbos100, setCarbos100] = useState('')
  const [grasas100, setGrasas100] = useState('')
  const [error, setError] = useState<string | null>(null)

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  const cantidad = leerGramos(gramos)
  const kcal = leerNumero(kcal100)

  // Vista previa en vivo: la regla de tres es justo lo que a nadie le apetece
  // hacer de cabeza, y verla mientras escribes es lo que evita guardar 400 g
  // creyendo que eran 40.
  const previsualizacion =
    cantidad !== null && kcal !== null
      ? porCantidad(
          {
            kcal_100: kcal,
            proteina_100: leerNumero(proteina100) ?? 0,
            carbos_100: leerNumero(carbos100) ?? 0,
            grasas_100: leerNumero(grasas100) ?? 0,
          },
          cantidad,
        )
      : null

  async function guardar() {
    if (nombre.trim() === '') { setError('Ponle un nombre para reconocerlo después.'); return }
    if (cantidad === null) { setError('Escribe cuántos gramos has comido.'); return }
    if (kcal === null) { setError('Escribe las kcal por 100 g, que es lo que pone la etiqueta.'); return }
    if (previsualizacion === null) return
    setError(null)
    await nutricion.registrar({
      momento, nombre: nombre.trim(), cantidad_g: cantidad, ...previsualizacion,
    })
    // Solo se vuelve si se guardó: `mutateAsync` rechaza al fallar.
    router.back()
  }

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[4] }}>
        <Texto variante="titulo">Entrada rápida</Texto>

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
          <Texto variante="etiqueta">Qué has comido</Texto>
          <TextInput
            style={campo}
            value={nombre}
            onChangeText={(v) => { setNombre(v); setError(null) }}
            placeholder="Pechuga de pollo"
            placeholderTextColor={t.color.textoTenue}
            editable={!nutricion.guardando}
          />
        </View>

        <View style={{ gap: t.espaciado[1] }}>
          <Texto variante="etiqueta">Cantidad (g)</Texto>
          <TextInput
            style={campo}
            value={gramos}
            onChangeText={(v) => { setGramos(v); setError(null) }}
            placeholder="150"
            placeholderTextColor={t.color.textoTenue}
            keyboardType="decimal-pad"
            editable={!nutricion.guardando}
          />
        </View>

        <View style={{ gap: t.espaciado[1] }}>
          <Texto variante="etiqueta">Por cada 100 g</Texto>
          <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
            {([
              ['kcal', kcal100, setKcal100],
              ['Prot.', proteina100, setProteina100],
              ['Carb.', carbos100, setCarbos100],
              ['Gras.', grasas100, setGrasas100],
            ] as const).map(([etiqueta, valor, poner]) => (
              <View key={etiqueta} style={{ flex: 1, gap: t.espaciado[0] }}>
                <Texto variante="tenue">{etiqueta}</Texto>
                <TextInput
                  style={campo}
                  value={valor}
                  onChangeText={(v) => { poner(v); setError(null) }}
                  placeholder="0"
                  placeholderTextColor={t.color.textoTenue}
                  keyboardType="decimal-pad"
                  editable={!nutricion.guardando}
                />
              </View>
            ))}
          </View>
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
          <Boton titulo="Cancelar" tono="secundario" alPulsar={() => router.back()} />
        </View>
      </ScrollView>
    </Pantalla>
  )
}
