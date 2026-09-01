## Tarea 5: Autenticación — correo, Google y Apple

Apple **exige** Sign in with Apple si la app ofrece Google en iOS. No es opcional.

**Ficheros:**
- Crear: `apps/kaizen/src/datos/autenticacion.ts`
- Test: `apps/kaizen/src/datos/autenticacion.test.ts`

**Interfaces:**
- Consume: `supabase` de la Tarea 4.
- Produce: `entrarConCorreo(correo, contrasena)`, `registrarConCorreo(correo, contrasena)`, `entrarConApple()`, `salir()`. Todas devuelven `Promise<{ error: string | null }>`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install expo-apple-authentication expo-auth-session expo-web-browser expo-crypto
```

- [ ] **Paso 2: Escribir los tests que fallan**

`src/datos/autenticacion.test.ts`:

```ts
import { entrarConCorreo, salir } from './autenticacion'

const signInWithPassword = jest.fn()
const signOut = jest.fn()

jest.mock('./supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
                      signOut: () => signOut() } },
}))

beforeEach(() => jest.clearAllMocks())

it('devuelve error nulo cuando el acceso funciona', async () => {
  signInWithPassword.mockResolvedValue({ error: null })
  await expect(entrarConCorreo('a@b.c', 'clave')).resolves.toEqual({ error: null })
})

it('traduce el error de credenciales a un mensaje en español', async () => {
  signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
  const { error } = await entrarConCorreo('a@b.c', 'mal')
  expect(error).toBe('Correo o contraseña incorrectos.')
})

it('salir devuelve error nulo y llama a signOut', async () => {
  signOut.mockResolvedValue({ error: null })
  await expect(salir()).resolves.toEqual({ error: null })
  expect(signOut).toHaveBeenCalled()
})

it('registrar traduce que el correo ya existe', async () => {
  signUp.mockResolvedValue({ error: { code: 'email_exists', message: 'User already registered' } })
  const { error } = await registrarConCorreo('a@b.c', 'clave')
  expect(error).toBe('Ya existe una cuenta con ese correo.')
})

it('registrar da un consejo accionable si la contraseña es débil', async () => {
  signUp.mockResolvedValue({ error: { code: 'weak_password', message: 'Password is too short' } })
  const { error } = await registrarConCorreo('a@b.c', '123')
  expect(error).toBe('La contraseña es demasiado corta. Usa al menos 6 caracteres.')
})

it('un error desconocido nunca deja pasar el texto en inglés', async () => {
  signInWithPassword.mockResolvedValue({ error: { message: 'Some unmapped GoTrue failure' } })
  const { error } = await entrarConCorreo('a@b.c', 'clave')
  expect(error).toBe('No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.')
})

describe('entrarConApple', () => {
  it('cancelar NO es un error', async () => {
    signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(entrarConApple()).resolves.toEqual({ error: null })
  })

  it('un fallo que no es cancelación sí avisa al usuario', async () => {
    signInAsync.mockRejectedValue({ code: 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE' })
    const { error } = await entrarConApple()
    expect(error).toBe('No hemos podido iniciar sesión con Apple. Prueba con tu correo.')
  })

  it('avisa si Apple no devuelve token', async () => {
    signInAsync.mockResolvedValue({ identityToken: null })
    const { error } = await entrarConApple()
    expect(error).toBe('Apple no ha devuelto un token válido. Prueba con tu correo.')
  })

  it('un fallo de Supabase no se disfraza de cancelación', async () => {
    signInAsync.mockResolvedValue({ identityToken: 'token-de-prueba' })
    signInWithIdToken.mockResolvedValue({ error: { message: 'Network request failed' } })
    const { error } = await entrarConApple()
    expect(error).not.toBeNull()
  })

  it('con token válido y Supabase conforme, entra', async () => {
    signInAsync.mockResolvedValue({ identityToken: 'token-de-prueba' })
    signInWithIdToken.mockResolvedValue({ error: null })
    await expect(entrarConApple()).resolves.toEqual({ error: null })
  })
})
```

El mock del principio del fichero tiene que crecer para cubrir lo nuevo: añade `signUp` y `signInWithIdToken` al mock de `supabase.auth`, y mockea también el módulo de Apple:

```ts
const signInAsync = jest.fn()
jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...a: unknown[]) => signInAsync(...a),
  AppleAuthenticationScope: { FULL_NAME: 'full_name' },
}))
```

Fíjate en el par de tests que importa de verdad: **cancelar devuelve `{ error: null }` y cualquier otro fallo devuelve un mensaje.** Si ese par no existe, nada impide que alguien «simplifique» el `catch` dentro de seis meses y vuelva a dejar el botón mudo.

- [ ] **Paso 3: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- autenticacion.test`
Esperado: FALLA con «Cannot find module './autenticacion'».

- [ ] **Paso 4: Implementar**

`src/datos/autenticacion.ts`:

```ts
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
```

> **Comprueba antes de escribir el código** que el `AuthError` de la versión instalada de `@supabase/supabase-js` expone `code`. Si no lo expusiera, quédate solo con el mapa por mensaje y anótalo como desviación: no inventes un campo que no existe.

> **Google** se añade en esta misma tarea con `expo-auth-session` y `supabase.auth.signInWithIdToken({ provider: 'google', token })`, siguiendo el mismo patrón que Apple. Requiere dar de alta los IDs de cliente OAuth en Google Cloud y en el panel de Supabase; hasta que existan esas credenciales, el botón se deja fuera de la pantalla en lugar de mostrarse roto.

- [ ] **Paso 5: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- autenticacion.test` → PASA

- [ ] **Paso 6: Comitear**

```bash
git add apps/kaizen/src/datos/autenticacion.ts apps/kaizen/src/datos/autenticacion.test.ts
git commit -m "feat(kaizen): autenticacion con correo y Apple"
```

> La **pantalla** de acceso se construye en la Tarea 9, cuando ya existen los componentes del sistema de diseño. Aquí solo se entrega el módulo.

---

