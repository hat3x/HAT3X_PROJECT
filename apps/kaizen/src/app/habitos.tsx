import { useState } from 'react'
import { View, TextInput, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'
import { usarHabitos } from '@/features/habitos/usar-habitos'

const TAMANO_ICONO = 20

/** Cuántos caben sin que la tarjeta del Home se coma la pantalla. */
const MAXIMO = 8

/**
 * Sugerencias para no empezar con una lista en blanco.
 *
 * Una pantalla vacía con un campo de texto pide que inventes algo, y lo que se
 * inventa a las once de la noche no se cumple. Estas son cosas concretas y
 * pequeñas, que es lo que de verdad se sostiene.
 */
const SUGERENCIAS = ['Creatina', 'Dormir 7 h', 'Pasear 20 min', 'Estirar', 'Nada de alcohol']

export default function Habitos() {
  const t = useTema()
  const router = useRouter()
  const habitos = usarHabitos()
  const [nombre, setNombre] = useState('')

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto, flex: 1,
  }

  const lleno = habitos.cuantos >= MAXIMO

  async function anadir(texto: string) {
    const limpio = texto.trim()
    if (limpio === '' || lleno) return
    setNombre('')
    await habitos.crear(limpio, null)
  }

  const sinUsar = SUGERENCIAS.filter(
    (sugerencia) => !habitos.habitos.some((h) => h.nombre.toLowerCase() === sugerencia.toLowerCase()),
  )

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: t.espaciado[5], gap: t.espaciado[4] }}>
        <View>
          <Texto variante="titulo">Hábitos</Texto>
          <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
            Cosas pequeñas que quieres hacer todos los días. Aparecen en el Home
            para marcarlas de un toque.
          </Texto>
        </View>

        <View style={{ flexDirection: 'row', gap: t.espaciado[1], alignItems: 'center' }}>
          <TextInput
            style={campo}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Creatina"
            placeholderTextColor={t.color.textoTenue}
            editable={!habitos.guardando && !lleno}
            onSubmitEditing={() => anadir(nombre)}
          />
          <Boton
            titulo="Añadir"
            deshabilitado={habitos.guardando || nombre.trim() === '' || lleno}
            alPulsar={() => anadir(nombre)}
          />
        </View>

        {lleno && (
          <Texto variante="tenue">
            Ocho es el máximo. Con más, la lista deja de mirarse y pasa a
            ignorarse.
          </Texto>
        )}

        {!lleno && sinUsar.length > 0 && (
          <View style={{ gap: t.espaciado[1] }}>
            <Texto variante="etiqueta">Ideas</Texto>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.espaciado[1] }}>
              {sinUsar.map((sugerencia) => (
                <Boton
                  key={sugerencia}
                  titulo={sugerencia}
                  tono="secundario"
                  deshabilitado={habitos.guardando}
                  alPulsar={() => anadir(sugerencia)}
                />
              ))}
            </View>
          </View>
        )}

        {habitos.errorAlGuardar && (
          <Texto variante="tenue" style={{ color: t.color.peligro }}>
            {habitos.errorAlGuardar}
          </Texto>
        )}

        {habitos.cuantos === 0 ? (
          <Vacio
            icono="check-circle"
            mensaje={
              habitos.cargando
                ? 'Cargando tus hábitos…'
                : 'Todavía no tienes ninguno. Añade uno arriba o toca una idea.'
            }
          />
        ) : (
          <View style={{ gap: t.espaciado[2] }}>
            {habitos.habitos.map((habito) => (
              <Superficie
                key={habito.id}
                fondo={t.superficie.tarjeta}
                radio={t.radio.tarjeta}
                style={{ padding: t.espaciado[4] }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[2] }}>
                  <Texto style={{ flex: 1 }}>{habito.nombre}</Texto>
                  {/* Quitar, no borrar: el registro de haberlo cumplido cuelga
                      del hábito en cascada, así que borrarlo se llevaría el
                      histórico por delante. */}
                  <Pressable
                    onPress={() => habitos.desactivar(habito.id)}
                    disabled={habitos.guardando}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${habito.nombre}`}
                  >
                    <Feather name="x" size={TAMANO_ICONO} color={t.color.textoTenue} />
                  </Pressable>
                </View>
              </Superficie>
            ))}
          </View>
        )}

        <Boton titulo="Listo" tono="secundario" alPulsar={() => router.back()} />
      </ScrollView>
    </Pantalla>
  )
}
