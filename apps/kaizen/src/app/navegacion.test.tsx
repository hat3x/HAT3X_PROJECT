import { render, screen } from '@testing-library/react-native'
import Coach from './(pestanas)/coach'
import { ProveedorTema } from '@/design/proveedor'

it('Coach muestra su estado vacío explicando por qué', () => {
  render(<ProveedorTema nombre="defecto"><Coach /></ProveedorTema>)
  expect(screen.getByText(/todavía no tengo datos suficientes/i)).toBeTruthy()
})
