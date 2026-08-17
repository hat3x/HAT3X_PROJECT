import { useEffect, useState, type ReactNode } from 'react'
import { View, Pressable, ScrollView, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'
import { TEMAS } from '@/design/temas/indice'
import { usarPerfil } from './usar-perfil'

const UNIDADES = [
  { clave: 'metrico', titulo: 'Métrico' },
  { clave: 'imperial', titulo: 'Imperial' },
] as const

// 0-12 y 0-23: mismo rango que exige la base de datos en `corte_dia` y
// `hora_silencio` (`supabase/migrations/0001_esquema.sql`). Repetir el rango
// aquí no lo duplica de mentira: es el que ve el usuario, y si algún día se
// amplía en la base, este selector tiene que ampliarse con él.
const CORTES_DIA = Array.from({ length: 13 }, (_, i) => i)
const HORAS_SILENCIO = Array.from({ length: 24 }, (_, i) => i)

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  const t = useTema()
  return (
    <View style={{ gap: t.espaciado[1] }}>
      <Texto variante="etiqueta">{titulo}</Texto>
      {children}
      {ayuda && <Texto variante="tenue">{ayuda}</Texto>}
    </View>
  )
}

function Ficha({ titulo, seleccionado, alPulsar }: {
  titulo: string
  seleccionado: boolean
  alPulsar: () => void
}) {
  const t = useTema()
  return (
    <Pressable onPress={alPulsar} accessibilityRole="button" accessibilityState={{ selected: seleccionado }}>
      <Superficie
        fondo={seleccionado ? t.superficie.botonPrimario : t.superficie.botonSecundario}
        radio={t.radio.pastilla}
        style={{ paddingVertical: t.espaciado[1], paddingHorizontal: t.espaciado[2] }}
      >
        <Texto style={{ color: seleccionado ? t.color.sobreAcento : t.color.texto }}>{titulo}</Texto>
      </Superficie>
    </Pressable>
  )
}

function SelectorNumerico({ valores, seleccionado, alSeleccionar }: {
  valores: number[]
  seleccionado: number
  alSeleccionar: (valor: number) => void
}) {
  const t = useTema()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
        {valores.map((valor) => (
          <Ficha
            key={valor}
            titulo={String(valor)}
            seleccionado={valor === seleccionado}
            alPulsar={() => alSeleccionar(valor)}
          />
        ))}
      </View>
    </ScrollView>
  )
}

export function Ajustes() {
  const t = useTema()
  const router = useRouter()
  const { perfil, guardar } = usarPerfil()
  const [zonaHoraria, setZonaHoraria] = useState('')

  // Sincroniza el campo con lo que llega del servidor, pero solo mientras el
  // usuario no está escribiendo: si reescribiéramos en cada render, cualquier
  // guardado en curso de OTRO control (p.ej. el tema) refrescaría la consulta
  // ['perfil', id] y borraría lo que la persona estuviera tecleando aquí.
  useEffect(() => {
    if (perfil) setZonaHoraria(perfil.zona_horaria)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.zona_horaria])

  if (!perfil) {
    return (
      <Pantalla style={{ padding: t.espaciado[5] }}>
        <Texto variante="tenue">Cargando ajustes…</Texto>
      </Pantalla>
    )
  }

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  function confirmarZonaHoraria() {
    if (perfil && zonaHoraria !== perfil.zona_horaria) guardar({ zona_horaria: zonaHoraria })
  }

  function detectarZonaHoraria() {
    const detectada = Intl.DateTimeFormat().resolvedOptions().timeZone
    setZonaHoraria(detectada)
    guardar({ zona_horaria: detectada })
  }

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[5] }}>
        <Texto variante="titulo">Ajustes</Texto>

        <Seccion titulo="Unidades">
          <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
            {UNIDADES.map((u) => (
              <View key={u.clave} style={{ flex: 1 }}>
                <Boton
                  titulo={u.titulo}
                  tono={perfil.unidades === u.clave ? 'primario' : 'secundario'}
                  alPulsar={() => guardar({ unidades: u.clave })}
                />
              </View>
            ))}
          </View>
        </Seccion>

        <Seccion titulo="Zona horaria">
          <TextInput
            style={campo}
            value={zonaHoraria}
            onChangeText={setZonaHoraria}
            onBlur={confirmarZonaHoraria}
            placeholderTextColor={t.color.textoTenue}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Boton titulo="Detectar automáticamente" tono="secundario" alPulsar={detectarZonaHoraria} />
        </Seccion>

        <Seccion titulo="Corte de día" ayuda="Lo que registres antes de esta hora contará como el día anterior.">
          <SelectorNumerico
            valores={CORTES_DIA}
            seleccionado={perfil.corte_dia}
            alSeleccionar={(valor) => guardar({ corte_dia: valor })}
          />
        </Seccion>

        <Seccion titulo="Hora de silencio" ayuda="No te avisaremos después de esta hora.">
          <SelectorNumerico
            valores={HORAS_SILENCIO}
            seleccionado={perfil.hora_silencio}
            alSeleccionar={(valor) => guardar({ hora_silencio: valor })}
          />
        </Seccion>

        <Seccion titulo="Tema">
          <View style={{ gap: t.espaciado[1] }}>
            {Object.keys(TEMAS).map((nombre) => (
              <Ficha
                key={nombre}
                titulo={nombre}
                seleccionado={perfil.tema === nombre}
                alPulsar={() => guardar({ tema: nombre })}
              />
            ))}
          </View>
        </Seccion>

        <Boton titulo="Borrar cuenta" tono="peligro" alPulsar={() => router.push('/borrar-cuenta')} />
      </ScrollView>
    </Pantalla>
  )
}
