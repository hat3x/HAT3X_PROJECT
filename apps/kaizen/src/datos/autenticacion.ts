import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from './supabase'

export type Resultado = { error: string | null }

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

function traducir(mensaje: string): string {
  return MENSAJES[mensaje] ?? 'No hemos podido completar la operación. Inténtalo de nuevo.'
}

export async function entrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena })
  return { error: error ? traducir(error.message) : null }
}

export async function registrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signUp({ email: correo, password: contrasena })
  return { error: error ? traducir(error.message) : null }
}

export async function entrarConApple(): Promise<Resultado> {
  try {
    const credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    })
    if (!credencial.identityToken) return { error: 'Apple no ha devuelto un token válido.' }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple', token: credencial.identityToken,
    })
    return { error: error ? traducir(error.message) : null }
  } catch {
    return { error: null } // el usuario canceló
  }
}

export async function salir(): Promise<Resultado> {
  const { error } = await supabase.auth.signOut()
  return { error: error ? traducir(error.message) : null }
}
