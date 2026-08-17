import { entrarConCorreo, salir } from './autenticacion'

const mockSignInWithPassword = jest.fn()
const mockSignOut = jest.fn()

jest.mock('./supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
                      signOut: () => mockSignOut() } },
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

it('salir llama a signOut', async () => {
  mockSignOut.mockResolvedValue({ error: null })
  await salir()
  expect(mockSignOut).toHaveBeenCalled()
})
