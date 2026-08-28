import { useState } from 'react'
import { View, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { useTema } from '@/design/proveedor'
import { usarPeso } from '@/features/peso/usar-peso'
import { leerKg, enKg, KG_MINIMO, KG_MAXIMO } from '@/dominio/peso'


export default function RegistrarPeso() {
  const t = useTema()
  const router = useRouter()
  const peso = usarPeso()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[3], color: t.color.texto, fontSize: 28,
  }

  async function guardar() {
    const kg = leerKg(texto)
    if (kg === null) {
      setError(`Escribe un peso entre ${KG_MINIMO} y ${KG_MAXIMO} kg.`)
      return
    }
    setError(null)
    await peso.guardar(kg)
    // Solo se vuelve si de verdad se guardó: `mutateAsync` rechaza cuando falla,
    // así que un error deja la pantalla abierta con el valor escrito en vez de
    // cerrarse dando la sensación de que se registró.
    router.back()
  }

  return (
    <Pantalla style={{ padding: t.espaciado[5], gap: t.espaciado[3] }}>
      <Texto variante="titulo">Peso</Texto>

      {peso.deHoy && (
        <Texto variante="tenue">
          Hoy ya has registrado {enKg(peso.deHoy.kg)} kg. Si guardas otro, lo sustituye.
        </Texto>
      )}

      <TextInput
        style={campo}
        value={texto}
        onChangeText={(valor) => { setTexto(valor); setError(null) }}
        placeholder="0,0"
        placeholderTextColor={t.color.textoTenue}
        keyboardType="decimal-pad"
        autoFocus
        editable={!peso.guardando}
      />

      {(error || peso.errorAlGuardar) && (
        <Texto variante="tenue" style={{ color: t.color.peligro }}>
          {error ?? peso.errorAlGuardar}
        </Texto>
      )}

      <View style={{ gap: t.espaciado[1] }}>
        <Boton
          titulo={peso.guardando ? 'Guardando…' : 'Guardar'}
          deshabilitado={peso.guardando}
          alPulsar={guardar}
        />
        <Boton titulo="Cancelar" tono="secundario" alPulsar={() => router.back()} />
      </View>
    </Pantalla>
  )
}
