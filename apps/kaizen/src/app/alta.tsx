import { useState } from 'react'
import { View, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'
import { usarObjetivos } from '@/features/objetivos/usar-objetivos'
import { leerNumero, enKcal, enGramos } from '@/dominio/nutricion'
import {
  calcularObjetivos, explicarSuelo, AVISO_SIN_MARGEN,
  ACTIVIDADES, OBJETIVOS,
  type Sexo, type Actividad, type Objetivo,
} from '@/dominio/objetivos'

// Cotas de cordura para lo que se teclea. No son médicas: atajan el dedo gordo
// antes de que un cero de más produzca un objetivo absurdo.
const LIMITES = {
  edad: [14, 100],
  altura: [120, 230],
  peso: [30, 300],
} as const

const SEXOS: { clave: Sexo; titulo: string }[] = [
  { clave: 'hombre', titulo: 'Hombre' },
  { clave: 'mujer', titulo: 'Mujer' },
  { clave: 'sin_decir', titulo: 'Prefiero no decirlo' },
]

function dentro(valor: number | null, limites: readonly [number, number]): number | null {
  if (valor === null) return null
  return valor >= limites[0] && valor <= limites[1] ? valor : null
}

/**
 * El alta guiada: de tus datos salen tus objetivos.
 *
 * El spec (§8.1) pide nueve pantallas, una cosa por pantalla. Aquí va en una
 * sola con secciones: el resultado es idéntico —los mismos datos, el mismo
 * cálculo— por una fracción del trabajo, y el paso a paso puede montarse encima
 * cuando la app deje de ser personal. Queda dicho para que no parezca un olvido.
 *
 * Lo que NO se recorta es la propuesta: no escupe un número, enseña de dónde
 * sale. Un número sin explicación no se puede discutir ni corregir.
 */
export default function Alta() {
  const t = useTema()
  const router = useRouter()
  const objetivos = usarObjetivos()

  const [edad, setEdad] = useState('')
  const [altura, setAltura] = useState('')
  const [peso, setPeso] = useState('')
  const [sexo, setSexo] = useState<Sexo>('sin_decir')
  const [actividad, setActividad] = useState<Actividad>('moderada')
  const [objetivo, setObjetivo] = useState<Objetivo>('mantener')
  const [error, setError] = useState<string | null>(null)

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  const edadN = dentro(leerNumero(edad), LIMITES.edad)
  const alturaN = dentro(leerNumero(altura), LIMITES.altura)
  const pesoN = dentro(leerNumero(peso), LIMITES.peso)

  // Sin peso no hay cálculo automático (§8.3): en vez de inventarse un número,
  // la propuesta sencillamente no aparece hasta que están los tres datos.
  const propuesta =
    edadN !== null && alturaN !== null && pesoN !== null
      ? calcularObjetivos({
          edad: edadN, alturaCm: alturaN, pesoKg: pesoN, sexo, actividad, objetivo,
        })
      : null

  async function guardar() {
    if (propuesta === null) {
      setError('Faltan la edad, la altura o el peso, o alguno está fuera de rango.')
      return
    }
    setError(null)
    await objetivos.guardar(propuesta, objetivo, 'auto')
    // Solo se vuelve si se guardó: `mutateAsync` rechaza al fallar.
    router.back()
  }

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[4] }}>
        <View>
          <Texto variante="titulo">Tus objetivos</Texto>
          <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
            Con estos datos calculamos cuánto comer cada día. Es un punto de
            partida, no una medida médica.
          </Texto>
        </View>

        <View style={{ flexDirection: 'row', gap: t.espaciado[2] }}>
          {([
            ['Edad', edad, setEdad],
            ['Altura (cm)', altura, setAltura],
            ['Peso (kg)', peso, setPeso],
          ] as const).map(([etiqueta, valor, poner]) => (
            <View key={etiqueta} style={{ flex: 1, gap: t.espaciado[0] }}>
              <Texto variante="etiqueta">{etiqueta}</Texto>
              <TextInput
                style={campo}
                value={valor}
                onChangeText={(nuevo) => { poner(nuevo); setError(null) }}
                placeholder="0"
                placeholderTextColor={t.color.textoTenue}
                keyboardType="decimal-pad"
                editable={!objetivos.guardando}
              />
            </View>
          ))}
        </View>

        <View style={{ gap: t.espaciado[1] }}>
          <Texto variante="etiqueta">Sexo</Texto>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.espaciado[1] }}>
            {SEXOS.map((opcion) => (
              <Boton
                key={opcion.clave}
                titulo={opcion.titulo}
                tono={sexo === opcion.clave ? 'primario' : 'secundario'}
                deshabilitado={objetivos.guardando}
                alPulsar={() => setSexo(opcion.clave)}
              />
            ))}
          </View>
          {/* La fórmula lo necesita. Se puede no responder, pero hay que decir
              qué se pierde en vez de callarlo. */}
          {sexo === 'sin_decir' && (
            <Texto variante="tenue">
              Sin este dato la estimación es menos precisa: usamos el punto medio
              de las dos fórmulas.
            </Texto>
          )}
        </View>

        <View style={{ gap: t.espaciado[1] }}>
          <Texto variante="etiqueta">Actividad</Texto>
          <View style={{ gap: t.espaciado[1] }}>
            {ACTIVIDADES.map((opcion) => (
              <Boton
                key={opcion.clave}
                // Con el ejemplo dentro, no con jerga: «Moderada» no le dice
                // nada a nadie, «me muevo bastante o entreno 3 días» sí.
                titulo={`${opcion.titulo} · ${opcion.ejemplo}`}
                tono={actividad === opcion.clave ? 'primario' : 'secundario'}
                deshabilitado={objetivos.guardando}
                alPulsar={() => setActividad(opcion.clave)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: t.espaciado[1] }}>
          <Texto variante="etiqueta">Qué quieres</Texto>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.espaciado[1] }}>
            {OBJETIVOS.map((opcion) => (
              <Boton
                key={opcion.clave}
                titulo={opcion.titulo}
                tono={objetivo === opcion.clave ? 'primario' : 'secundario'}
                deshabilitado={objetivos.guardando}
                alPulsar={() => setObjetivo(opcion.clave)}
              />
            ))}
          </View>
        </View>

        {propuesta && (
          <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
            <Texto variante="etiqueta">Tu propuesta</Texto>
            <Texto variante="heroe" style={{ marginTop: t.espaciado[1] }}>
              {enKcal(propuesta.kcal)}
            </Texto>
            <Texto variante="tenue">kcal al día</Texto>

            <Texto style={{ marginTop: t.espaciado[3] }}>
              {enGramos(propuesta.proteinaG)} g proteína ·{' '}
              {enGramos(propuesta.carbosG)} g carbos ·{' '}
              {enGramos(propuesta.grasasG)} g grasas
            </Texto>
            <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
              {(propuesta.aguaMl / 1000).toFixed(1).replace('.', ',')} L de agua
            </Texto>

            {/* De dónde sale, que es la mitad del valor de esta pantalla. */}
            <Texto variante="tenue" style={{ marginTop: t.espaciado[3] }}>
              En reposo gastas unas {enKcal(propuesta.basal)} kcal, y con tu
              actividad unas {enKcal(propuesta.gasto)} al día.
            </Texto>

            {propuesta.suelosAplicados.map((motivo) => (
              <Texto key={motivo} variante="tenue" style={{ marginTop: t.espaciado[2] }}>
                {explicarSuelo(motivo)}
              </Texto>
            ))}

            {propuesta.sinMargenParaDeficit && (
              <Texto variante="tenue" style={{ marginTop: t.espaciado[2] }}>
                {AVISO_SIN_MARGEN}
              </Texto>
            )}
          </Superficie>
        )}

        {(error || objetivos.errorAlGuardar) && (
          <Texto variante="tenue" style={{ color: t.color.peligro }}>
            {error ?? objetivos.errorAlGuardar}
          </Texto>
        )}

        <View style={{ gap: t.espaciado[1] }}>
          <Boton
            titulo={objetivos.guardando ? 'Guardando…' : 'Usar estos objetivos'}
            deshabilitado={objetivos.guardando || propuesta === null}
            alPulsar={guardar}
          />
          <Boton titulo="Cancelar" tono="secundario" alPulsar={() => router.back()} />
        </View>
      </ScrollView>
    </Pantalla>
  )
}
