import { useState } from 'react'
import { View, TextInput, Platform } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { useTema } from '@/design/proveedor'
import { entrarConCorreo, registrarConCorreo, entrarConApple } from '@/datos/autenticacion'

export default function Acceso() {
  const t = useTema()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function ejecutar(accion: () => Promise<{ error: string | null }>) {
    setOcupado(true)
    setError((await accion()).error)
    setOcupado(false)
  }

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5], gap: t.espaciado[2] }}>
      <Texto variante="titulo">Entrar en KAIZEN</Texto>

      <TextInput
        style={campo}
        value={correo}
        onChangeText={setCorreo}
        placeholder="Correo"
        placeholderTextColor={t.color.textoTenue}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={campo}
        value={contrasena}
        onChangeText={setContrasena}
        placeholder="Contraseña"
        placeholderTextColor={t.color.textoTenue}
        secureTextEntry
      />

      {error && <Texto variante="tenue" style={{ color: '#E2574C' }}>{error}</Texto>}

      <Boton titulo={ocupado ? 'Un momento…' : 'Entrar'}
             alPulsar={() => ejecutar(() => entrarConCorreo(correo, contrasena))} />
      <Boton titulo="Crear cuenta" tono="secundario"
             alPulsar={() => ejecutar(() => registrarConCorreo(correo, contrasena))} />
      {Platform.OS === 'ios' && (
        <Boton titulo="Continuar con Apple" tono="secundario"
               alPulsar={() => ejecutar(entrarConApple)} />
      )}
    </View>
  )
}
