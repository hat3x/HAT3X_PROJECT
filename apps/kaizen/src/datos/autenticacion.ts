import * as AppleAuthentication from 'expo-apple-authentication'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Resultado = { error: string | null }

/** Código que devuelve Expo cuando la persona cierra el diálogo de Apple. */
const CANCELADO = 'ERR_REQUEST_CANCELED'

/**
 * Se traduce por `code` cuando existe: los textos de GoTrue cambian entre
 * versiones, los códigos no. El mapa por mensaje queda como red para las
 * versiones que todavía no envían código.
 */
const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_exists: 'Ya existe una cuenta con ese correo.',
  user_already_exists: 'Ya existe una cuenta con ese correo.',
  weak_password: 'La contraseña es demasiado corta. Usa al menos 6 caracteres.',
  validation_failed: 'Revisa el correo: no tiene un formato válido.',
  email_not_confirmed: 'Todavía no has confirmado tu correo. Mira tu bandeja de entrada.',
  over_email_send_rate_limit: 'Has pedido demasiados correos seguidos. Espera un minuto.',
}

const POR_MENSAJE: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ya existe una cuenta con ese correo.',
}

function traducir(error: AuthError): string {
  const porCodigo = error.code ? POR_CODIGO[error.code] : undefined
  if (porCodigo) return porCodigo
  const porMensaje = POR_MENSAJE[error.message]
  if (porMensaje) return porMensaje
  // Nunca «inténtalo de nuevo» a secas: reintentar lo mismo falla igual.
  return 'No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.'
}

function esCancelacion(fallo: unknown): boolean {
  return (
    typeof fallo === 'object' &&
    fallo !== null &&
    'code' in fallo &&
    (fallo as { code: unknown }).code === CANCELADO
  )
}

export async function entrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena })
  return { error: error ? traducir(error) : null }
}

export async function registrarConCorreo(correo: string, contrasena: string): Promise<Resultado> {
  const { error } = await supabase.auth.signUp({ email: correo, password: contrasena })
  return { error: error ? traducir(error) : null }
}

export async function entrarConApple(): Promise<Resultado> {
  let credencial: AppleAuthentication.AppleAuthenticationCredential

  // El `try` envuelve SOLO el diálogo nativo. Si abarcase también la llamada a
  // Supabase, un fallo de red se diagnosticaría como «el usuario canceló».
  try {
    credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    })
  } catch (fallo) {
    // Cancelar no es un fallo: cambió de opinión y no hay nada que decirle.
    if (esCancelacion(fallo)) return { error: null }
    // Cualquier otra cosa sí lo es: dispositivo sin Apple configurado, diálogo
    // que revienta... Callarse aquí deja al usuario tocando un botón muerto.
    return { error: 'No hemos podido iniciar sesión con Apple. Prueba con tu correo.' }
  }

  if (!credencial.identityToken) {
    return { error: 'Apple no ha devuelto un token válido. Prueba con tu correo.' }
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credencial.identityToken,
  })
  return { error: error ? traducir(error) : null }
}

export async function salir(): Promise<Resultado> {
  const { error } = await supabase.auth.signOut()
  return { error: error ? traducir(error) : null }
}
