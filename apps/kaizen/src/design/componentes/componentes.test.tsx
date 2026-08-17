import { render, screen, fireEvent } from '@testing-library/react-native'
import { ProveedorTema } from '../proveedor'
import { Texto } from './texto'
import { Boton } from './boton'
import { Barra } from './barra'

function envolver(nodo: React.ReactNode) {
  return render(<ProveedorTema nombre="defecto">{nodo}</ProveedorTema>)
}

it('el texto toma el color del tema', () => {
  envolver(<Texto>Hola</Texto>)
  expect(screen.getByText('Hola')).toHaveStyle({ color: '#F4F5F2' })
})

it('la etiqueta usa el color tenue y va en mayúsculas', () => {
  envolver(<Texto variante="etiqueta">Agua</Texto>)
  expect(screen.getByText('AGUA')).toHaveStyle({ color: '#98A09A' })
})

it('el botón dispara su acción', () => {
  const alPulsar = jest.fn()
  envolver(<Boton titulo="Registrar" alPulsar={alPulsar} />)
  fireEvent.press(screen.getByText('Registrar'))
  expect(alPulsar).toHaveBeenCalledTimes(1)
})

it('la barra recorta el progreso al 100 por ciento', () => {
  envolver(<Barra progreso={1.8} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '100%' })
})

it('la barra no acepta progresos negativos', () => {
  envolver(<Barra progreso={-0.5} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '0%' })
})
