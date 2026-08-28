import { entrarConCorreo, salir, registrarConCorreo, entrarConApple } from './autenticacion'

const mockSignInWithPassword = jest.fn()
const mockSignOut = jest.fn()
const mockSignUp = jest.fn()
const mockSignInWithIdToken = jest.fn()
const mockSignInAsync = jest.fn()

jest.mock('./supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
                      signOut: () => mockSignOut(),
                      signUp: (...a: unknown[]) => mockSignUp(...a),
                      signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}))

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...a: unknown[]) => mockSignInAsync(...a),
  AppleAuthenticationScope: { FULL_NAME: 'full_name' },
}))

beforeEach(() => jest.clearAllMocks())

it('devuelve error nulo cuando el acceso funciona', async () => {
  mockSignInWithPassword.mockResolvedValue({ error: null })
  await expect(entrarConCorreo('a@b.c', 'clave')).resolves.toEqual({ error: null })
})

it('traduce el error de credenciales a un mensaje en español', async () => {
  mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
  const { error } = await entrarConCorreo('a@b.c', 'mal')
  expect(error).toBe('Correo o contraseña incorrectos.')
})

it('salir devuelve error nulo y llama a signOut', async () => {
  mockSignOut.mockResolvedValue({ error: null })
  await expect(salir()).resolves.toEqual({ error: null })
  expect(mockSignOut).toHaveBeenCalled()
})

it('registrar traduce que el correo ya existe', async () => {
  mockSignUp.mockResolvedValue({ error: { code: 'email_exists', message: 'User already registered' } })
  const { error } = await registrarConCorreo('a@b.c', 'clave')
  expect(error).toBe('Ya existe una cuenta con ese correo.')
})

it('registrar da un consejo accionable si la contraseña es débil', async () => {
  mockSignUp.mockResolvedValue({ error: { code: 'weak_password', message: 'Password is too short' } })
  const { error } = await registrarConCorreo('a@b.c', '123')
  expect(error).toBe('La contraseña es demasiado corta. Usa al menos 6 caracteres.')
})

it('un error desconocido nunca deja pasar el texto en inglés', async () => {
  mockSignInWithPassword.mockResolvedValue({ error: { message: 'Some unmapped GoTrue failure' } })
  const { error } = await entrarConCorreo('a@b.c', 'clave')
  expect(error).toBe('No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.')
})

describe('entrarConApple', () => {
  it('cancelar NO es un error', async () => {
    mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(entrarConApple()).resolves.toEqual({ error: null })
  })

  it('un fallo que no es cancelación sí avisa al usuario', async () => {
    mockSignInAsync.mockRejectedValue({ code: 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE' })
    const { error } = await entrarConApple()
    expect(error).toBe('No hemos podido iniciar sesión con Apple. Prueba con tu correo.')
  })

  it('avisa si Apple no devuelve token', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null })
    const { error } = await entrarConApple()
    expect(error).toBe('Apple no ha devuelto un token válido. Prueba con tu correo.')
  })

  it('un fallo de Supabase no se disfraza de cancelación', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-de-prueba' })
    mockSignInWithIdToken.mockResolvedValue({ error: { message: 'Network request failed' } })
    const { error } = await entrarConApple()
    expect(error).not.toBeNull()
  })

  it('con token válido y Supabase conforme, entra', async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: 'token-de-prueba' })
    mockSignInWithIdToken.mockResolvedValue({ error: null })
    await expect(entrarConApple()).resolves.toEqual({ error: null })
  })
})
