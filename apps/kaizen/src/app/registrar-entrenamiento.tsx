import { useState } from 'react'
import { View, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { useTema } from '@/design/proveedor'
import { usarEntrenamiento } from '@/features/entrenamiento/usar-entrenamiento'
import {
  TIPOS_ENTRENAMIENTO,
  leerMinutos,
  MINUTOS_MINIMO,
  MINUTOS_MAXIMO,
  type TipoEntrenamiento,
} from '@/dominio/entrenamiento'

export default function RegistrarEntrenamiento() {
  const t = useTema()
  const router = useRouter()
  const entreno = usarEntrenamiento()
  const [tipo, setTipo] = useState<TipoEntrenamiento>('fuerza')
  const [minutos, setMinutos] = useState('')
  const [error, setError] = useState<string | null>(null)

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[3], color: t.color.texto, fontSize: 28,
  }

  async function guardar() {
    // La duración es opcional: quien no la sepa registra igual que ha
    // entrenado, que es el dato que de verdad importa. Solo se valida cuando
    // se ha escrito algo.
    const escrito = minutos.trim()
    const duracion = escrito === '' ? null : leerMinutos(escrito)
    if (escrito !== '' && duracion === null) {
      setError(`Escribe los minutos entre ${MINUTOS_MINIMO} y ${MINUTOS_MAXIMO}, o déjalo vacío.`)
      return
    }
    setError(null)
    await entreno.registrar(tipo, duracion)
    // Solo se vuelve si se guardó: `mutateAsync` rechaza al fallar, así que un
    // error deja la pantalla abierta en vez de cerrarse fingiendo un éxito.
    router.back()
  }

  return (
    <Pantalla style={{ padding: t.espaciado[5], gap: t.espaciado[4] }}>
      <Texto variante="titulo">Entrenamiento</Texto>

      <View style={{ gap: t.espaciado[1] }}>
        <Texto variante="etiqueta">Tipo</Texto>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.espaciado[1] }}>
          {TIPOS_ENTRENAMIENTO.map((opcion) => (
            <Boton
              key={opcion.clave}
              titulo={opcion.titulo}
              tono={tipo === opcion.clave ? 'primario' : 'secundario'}
              deshabilitado={entreno.guardando}
              alPulsar={() => setTipo(opcion.clave)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: t.espaciado[1] }}>
        <Texto variante="etiqueta">Duración (opcional)</Texto>
        <TextInput
          style={campo}
          value={minutos}
          onChangeText={(valor) => { setMinutos(valor); setError(null) }}
          placeholder="min"
          placeholderTextColor={t.color.textoTenue}
          keyboardType="number-pad"
          editable={!entreno.guardando}
        />
      </View>

      {entreno.deHoy.length > 0 && (
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[3] }}>
          <Texto variante="tenue">
            Hoy ya llevas {entreno.deHoy.length}{' '}
            {entreno.deHoy.length === 1 ? 'sesión' : 'sesiones'}. Esta se suma.
          </Texto>
        </Superficie>
      )}

      {(error || entreno.errorAlGuardar) && (
        <Texto variante="tenue" style={{ color: t.color.peligro }}>
          {error ?? entreno.errorAlGuardar}
        </Texto>
      )}

      <View style={{ gap: t.espaciado[1] }}>
        <Boton
          titulo={entreno.guardando ? 'Guardando…' : 'Guardar'}
          deshabilitado={entreno.guardando}
          alPulsar={guardar}
        />
        <Boton titulo="Cancelar" tono="secundario" alPulsar={() => router.back()} />
      </View>
    </Pantalla>
  )
}
