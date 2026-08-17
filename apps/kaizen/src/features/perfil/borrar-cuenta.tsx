import { useState } from 'react'
import { TextInput } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { Pantalla } from '@/design/componentes/pantalla'
import { useTema } from '@/design/proveedor'
import { supabase } from '@/datos/supabase'

const PALABRA_CONFIRMACION = 'BORRAR'

/**
 * A diferencia de borrar un registro (que va sin confirmación y con
 * «deshacer»), esto es irreversible y no tiene deshacer: por eso exige
 * escribir la palabra exacta antes de habilitar el botón, en vez del patrón
 * habitual de esta app.
 */
export function BorrarCuenta() {
  const t = useTema()
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)

  const habilitado = confirmacion === PALABRA_CONFIRMACION && !borrando

  async function confirmar() {
    if (!habilitado) return
    setBorrando(true)
    setError(null)
    const { error: errorFuncion } = await supabase.functions.invoke('borrar-cuenta', { method: 'POST' })
    if (errorFuncion) {
      setError('No hemos podido borrar la cuenta. Inténtalo de nuevo.')
      setBorrando(false)
      return
    }
    // El servidor ya ha borrado el usuario y sus datos: cerrar sesión limpia
    // el estado local y dispara la redirección a `/acceso` desde la raíz de
    // la app (ver `src/app/_layout.tsx`), sin que esta pantalla tenga que
    // saber nada de navegación. Si esto falla, la cuenta ya está borrada de
    // todos modos: no es el mismo error que el de arriba, y sin este aviso
    // la pantalla se quedaría en «Borrando…» para siempre sin decir nada.
    try {
      await supabase.auth.signOut()
    } catch {
      setError(
        'Tu cuenta se ha borrado, pero no hemos podido cerrar la sesión en este dispositivo. Cierra la app para completar el proceso.',
      )
      setBorrando(false)
    }
  }

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  return (
    <Pantalla style={{ padding: t.espaciado[5], gap: t.espaciado[2] }}>
      <Texto variante="titulo">Borrar cuenta</Texto>
      <Texto variante="cuerpo">
        Esto borra tu cuenta y todos tus datos —peso, medidas, fotos y alimentación— de forma
        permanente. No se puede deshacer.
      </Texto>
      <Texto variante="cuerpo">Escribe {PALABRA_CONFIRMACION} para confirmar.</Texto>

      <TextInput
        style={campo}
        value={confirmacion}
        onChangeText={setConfirmacion}
        placeholder={PALABRA_CONFIRMACION}
        placeholderTextColor={t.color.textoTenue}
        autoCorrect={false}
        editable={!borrando}
      />

      {error && <Texto variante="tenue" style={{ color: t.color.peligro }}>{error}</Texto>}

      <Boton
        titulo={borrando ? 'Borrando…' : 'Borrar mi cuenta'}
        tono="peligro"
        deshabilitado={!habilitado}
        alPulsar={confirmar}
      />
    </Pantalla>
  )
}
