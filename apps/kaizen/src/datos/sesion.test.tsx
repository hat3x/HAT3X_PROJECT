import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ProveedorSesion, useSesion } from './sesion'

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}))

function Sonda() {
  const { sesion, cargando } = useSesion()
  return <Text>{cargando ? 'cargando' : sesion ? 'dentro' : 'fuera'}</Text>
}

it('empieza cargando y acaba sin sesión', async () => {
  render(<ProveedorSesion><Sonda /></ProveedorSesion>)
  await waitFor(() => expect(screen.getByText('fuera')).toBeTruthy())
})
