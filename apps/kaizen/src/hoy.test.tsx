import { render, screen, fireEvent } from '@testing-library/react-native'
import { ScrollView } from 'react-native'
import Hoy from './app/(pestanas)/index'
import { ProveedorTema } from '@/design/proveedor'

// El agua se sustituye entera en vez de simular Supabase por debajo: este
// fichero comprueba que el Home PINTA y que esta CONECTADO, no de donde sale el
// dato. Lo de donde sale lo cubren `usar-agua.test.ts` y, contra base real,
// `pruebas/agua.integracion.test.ts`. Ademas, importar el cliente de Supabase
// aqui reventaria el suite: exige las variables de entorno al cargarse.
//
// Prefijo `mock` obligatorio por el hoisting de Jest, igual que `mockPush`.
const mockAnadir = jest.fn()
jest.mock('@/features/agua/usar-agua', () => ({
  usarAgua: () => ({
    ml: 1000,
    objetivoMl: 2500,
    cargando: false,
    anadir: mockAnadir,
    guardando: false,
    errorAlGuardar: null,
  }),
}))

// Prefijo `mock` obligatorio por el hoisting de Jest (mismo patrón que
// `ajustes.test.tsx`): el Home usa `useRouter` para el enlace a Ajustes.
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

// Sin sesion ni red: es el estado en el que arranca la app antes de que
// conteste el servidor, y lo que hay que ver entonces es el guion del agua, no
// un cero que se lee como «hoy no has bebido» cuando en realidad no se sabe.
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

  // El agua ya NO sale de los datos de ejemplo: llega de `usarAgua`, aqui
  // sustituido. Los 1000 ml se ensenan en litros y con un decimal aunque sean
  // redondos: «1 / 2,5 L» parecia mezclar dos unidades distintas.
  expect(screen.getByText('AGUA')).toBeTruthy()
  expect(screen.getByText('1,0 / 2,5 L')).toBeTruthy()

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

it('los botones de agua registran la cantidad que anuncian', () => {
  envolver()
  fireEvent.press(screen.getByText('+250'))
  expect(mockAnadir).toHaveBeenCalledWith(250)
  fireEvent.press(screen.getByText('+500'))
  expect(mockAnadir).toHaveBeenCalledWith(500)
})
