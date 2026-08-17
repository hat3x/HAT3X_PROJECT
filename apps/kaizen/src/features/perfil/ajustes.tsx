import { useEffect, useState, type ReactNode } from 'react'
import { View, Pressable, ScrollView, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'
import { TEMAS } from '@/design/temas/indice'
import { salir } from '@/datos/autenticacion'
import { purgarCacheLocal } from '@/datos/cliente-consultas'
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

// Etiquetas legibles para las claves crudas de `TEMAS`. Un tema que no esté
// en este mapa (p. ej. el que añade el perfil `personal` de EAS desde fuera
// del control de versiones, ver `design/temas/indice.ts`) cae a su propia
// clave con la primera letra en mayúscula, en vez de romper o desaparecer.
const ETIQUETAS_TEMA: Record<string, string> = {
  defecto: 'Oscuro',
  claro: 'Claro',
}

function etiquetaTema(nombre: string): string {
  return ETIQUETAS_TEMA[nombre] ?? nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

/**
 * Valida contra el mismo mecanismo que después consume la zona horaria
 * (`fechaLocal`, Tarea 3), no contra una lista propia: si `Intl` la acepta,
 * el cálculo del día funcionará con ella; si `Intl` la rechaza, aceptarla
 * aquí solo trasladaría la rotura, en silencio, al cálculo del día entero.
 */
function esZonaValida(valor: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: valor })
    return true
  } catch {
    return false
  }
}

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

function Ficha({ titulo, seleccionado, deshabilitado = false, alPulsar }: {
  titulo: string
  seleccionado: boolean
  deshabilitado?: boolean
  alPulsar: () => void
}) {
  const t = useTema()
  return (
    <Pressable
      onPress={alPulsar}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
      style={{ opacity: deshabilitado ? 0.5 : 1 }}
    >
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

function SelectorNumerico({ valores, seleccionado, deshabilitado = false, alSeleccionar }: {
  valores: number[]
  seleccionado: number
  deshabilitado?: boolean
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
            deshabilitado={deshabilitado}
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
  const clienteConsultas = useQueryClient()
  const { perfil, guardar, guardando, errorAlGuardar } = usarPerfil()
  const [zonaHoraria, setZonaHoraria] = useState('')
  const [errorZona, setErrorZona] = useState<string | null>(null)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [errorSesion, setErrorSesion] = useState<string | null>(null)

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

  function alCambiarZonaHoraria(valor: string) {
    setZonaHoraria(valor)
    setErrorZona(null)
  }

  function confirmarZonaHoraria() {
    if (!perfil || zonaHoraria === perfil.zona_horaria) return
    if (!esZonaValida(zonaHoraria)) {
      setErrorZona('Esa zona horaria no existe. Revisa cómo la has escrito.')
      return
    }
    setErrorZona(null)
    guardar({ zona_horaria: zonaHoraria })
  }

  async function cerrarSesion() {
    setCerrandoSesion(true)
    setErrorSesion(null)
    const { error } = await salir()
    if (error) {
      setErrorSesion(error)
      setCerrandoSesion(false)
      return
    }
    // El `signOut()` de dentro de `salir()` ya ha disparado la redirección a
    // `/acceso` desde la raíz de la app (ver `src/app/_layout.tsx`); purgar
    // aquí evita que el JSON del perfil —nombre, unidades, zona horaria,
    // tema— sobreviva en el disco del dispositivo a la sesión que lo guardó.
    await purgarCacheLocal(clienteConsultas)
  }

  function detectarZonaHoraria() {
    // Lo que devuelve `Intl` en este dispositivo es, por construcción, una
    // zona que el propio `Intl` acepta: no hace falta validarla.
    const detectada = Intl.DateTimeFormat().resolvedOptions().timeZone
    setZonaHoraria(detectada)
    setErrorZona(null)
    guardar({ zona_horaria: detectada })
  }

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[5] }}>
        <Texto variante="titulo">Ajustes</Texto>

        {errorAlGuardar && (
          <Texto variante="tenue" style={{ color: t.color.peligro }}>{errorAlGuardar}</Texto>
        )}

        <Seccion titulo="Unidades">
          <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
            {UNIDADES.map((u) => (
              <View key={u.clave} style={{ flex: 1 }}>
                <Boton
                  titulo={u.titulo}
                  tono={perfil.unidades === u.clave ? 'primario' : 'secundario'}
                  deshabilitado={guardando}
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
            onChangeText={alCambiarZonaHoraria}
            onBlur={confirmarZonaHoraria}
            placeholderTextColor={t.color.textoTenue}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!guardando}
          />
          {errorZona && (
            <Texto variante="tenue" style={{ color: t.color.peligro }}>{errorZona}</Texto>
          )}
          <Boton
            titulo="Detectar automáticamente"
            tono="secundario"
            deshabilitado={guardando}
            alPulsar={detectarZonaHoraria}
          />
        </Seccion>

        <Seccion titulo="Corte de día" ayuda="Lo que registres antes de esta hora contará como el día anterior.">
          <SelectorNumerico
            valores={CORTES_DIA}
            seleccionado={perfil.corte_dia}
            deshabilitado={guardando}
            alSeleccionar={(valor) => guardar({ corte_dia: valor })}
          />
        </Seccion>

        <Seccion titulo="Hora de silencio" ayuda="No te avisaremos después de esta hora.">
          <SelectorNumerico
            valores={HORAS_SILENCIO}
            seleccionado={perfil.hora_silencio}
            deshabilitado={guardando}
            alSeleccionar={(valor) => guardar({ hora_silencio: valor })}
          />
        </Seccion>

        <Seccion titulo="Tema">
          <View style={{ gap: t.espaciado[1] }}>
            {Object.keys(TEMAS).map((nombre) => (
              <Ficha
                key={nombre}
                titulo={etiquetaTema(nombre)}
                seleccionado={perfil.tema === nombre}
                deshabilitado={guardando}
                alPulsar={() => guardar({ tema: nombre })}
              />
            ))}
          </View>
        </Seccion>

        {errorSesion && (
          <Texto variante="tenue" style={{ color: t.color.peligro }}>{errorSesion}</Texto>
        )}
        <Boton
          titulo={cerrandoSesion ? 'Cerrando sesión…' : 'Cerrar sesión'}
          tono="secundario"
          deshabilitado={cerrandoSesion}
          alPulsar={cerrarSesion}
        />

        <Boton titulo="Borrar cuenta" tono="peligro" alPulsar={() => router.push('/borrar-cuenta')} />
      </ScrollView>
    </Pantalla>
  )
}
