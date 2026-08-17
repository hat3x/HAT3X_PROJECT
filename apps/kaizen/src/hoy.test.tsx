import { render, screen } from '@testing-library/react-native'
import { ScrollView } from 'react-native'
import Hoy from './app/(pestanas)/index'
import { ProveedorTema } from '@/design/proveedor'

// Prefijo `mock` obligatorio por el hoisting de Jest (mismo patrón que
// `ajustes.test.tsx`): el Home usa `useRouter` para el enlace a Ajustes.
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

function envolver() {
  return render(
    <ProveedorTema nombre="defecto">
      <Hoy />
    </ProveedorTema>,
  )
}

it('el Home pinta el score, las calorías, los tres macros, el agua y la misión', () => {
  envolver()

  // Saludo.
  expect(screen.getByText('Buenos días, Jota')).toBeTruthy()

  // Kaizen Score: el número dentro del anillo y su etiqueta (las etiquetas
  // van en mayúsculas por el tema, igual que en componentes.test.tsx).
  expect(screen.getByText('82')).toBeTruthy()
  expect(screen.getByText('KAIZEN SCORE')).toBeTruthy()

  // Calorías consumidas/objetivo, con separador de miles, y lo que resta.
  expect(screen.getByText('1.720 / 2.300')).toBeTruthy()
  expect(screen.getByText('580 restantes')).toBeTruthy()

  // Los tres macros: etiqueta y número de cada uno.
  expect(screen.getByText('PROTEÍNA')).toBeTruthy()
  expect(screen.getByText('132/170')).toBeTruthy()
  expect(screen.getByText('CARBOS')).toBeTruthy()
  expect(screen.getByText('164/220')).toBeTruthy()
  expect(screen.getByText('GRASAS')).toBeTruthy()
  expect(screen.getByText('48/70')).toBeTruthy()

  // Agua, con coma decimal a la española.
  expect(screen.getByText('AGUA')).toBeTruthy()
  expect(screen.getByText('1,8 / 2,5 L')).toBeTruthy()

  // La misión de hoy: sus cinco líneas, en orden.
  expect(screen.getByText('Desayuno registrado')).toBeTruthy()
  expect(screen.getByText('1 L de agua')).toBeTruthy()
  expect(screen.getByText('Llegar a 170 g de proteína')).toBeTruthy()
  expect(screen.getByText('Entrenamiento')).toBeTruthy()
  expect(screen.getByText('Registrar cena')).toBeTruthy()
})

it('el Home se puede desplazar: el contenido vive dentro de un ScrollView', () => {
  envolver()
  expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy()
})
