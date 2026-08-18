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
// El Home lee el nombre del perfil y la fecha del dia. Se sustituyen los dos:
// este fichero comprueba que PINTA, no de donde salen los datos —y ademas
// importar el cliente de Supabase aqui revienta el suite.
jest.mock('@/features/perfil/usar-perfil', () => ({
  usarPerfil: () => ({ perfil: { nombre: 'Jota' }, guardar: jest.fn(), guardando: false, errorAlGuardar: null }),
}))
jest.mock('@/features/dia/usar-fecha-de-hoy', () => ({
  usarFechaDeHoy: () => '2026-08-18',
}))
jest.mock('@/features/nutricion/usar-nutricion', () => ({
  usarNutricion: () => ({
    items: [],
    total: { kcal: 1720, proteina_g: 132, carbos_g: 164, grasas_g: 48 },
    objetivos: { kcal: 2300, proteina_g: 170, carbos_g: 220, grasas_g: 70 },
    cargando: false,
    registrar: jest.fn(),
    guardando: false,
    errorAlGuardar: null,
  }),
}))
jest.mock('@/features/entrenamiento/usar-entrenamiento', () => ({
  usarEntrenamiento: () => ({
    historico: [],
    deHoy: [{ tipo: 'fuerza', duracion_min: 75 }],
    cargando: false,
    registrar: jest.fn(),
    guardando: false,
    errorAlGuardar: null,
  }),
}))
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
  // La fecha de verdad, no el «Día 24 · Fase Definición» inventado de antes.
  expect(screen.getByText('Martes, 18 de agosto')).toBeTruthy()

  // Kaizen Score: el número dentro del anillo y su etiqueta (las etiquetas
  // van en mayúsculas por el tema, igual que en componentes.test.tsx).
  // El score ya no es un 82 fijo: sale de lo simulado arriba. Echada la cuenta
  // a mano, que es lo unico que hace de esto una comprobacion y no un espejo:
  //   calorias    1720/2300, dia en curso -> 1720/2116 = 0,8129  x30 = 24,39
  //   proteina     132/170                = 0,7765             x25 = 19,41
  //   hidratacion 1000/2500               = 0,4000             x15 =  6,00
  //   entrenamiento  1 sesion             = 1                  x20 = 20,00
  //   -> 69,80 sobre 90 activos = 77,55 -> 78
  expect(screen.getByText('78')).toBeTruthy()
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

  // El entrenamiento tampoco sale ya de los datos de ejemplo: describe lo
  // registrado hoy, y el boton cambia a «Otro» porque ya hay una sesion.
  expect(screen.getByText('Fuerza · 1 h 15 min')).toBeTruthy()
  expect(screen.getByText('Otro')).toBeTruthy()

  // La misión de hoy: sus cinco líneas, en orden.
  // La mision se deriva de lo registrado, no es una lista fija: con el
  // entrenamiento simulado a una sesion, esa linea sale marcada y las de comida
  // sin marcar, porque los items simulados van vacios.
  expect(screen.getByText('Registrar el desayuno')).toBeTruthy()
  expect(screen.getByText('Registrar la cena')).toBeTruthy()
  expect(screen.getByText('Llegar a 170 g de proteína')).toBeTruthy()
  expect(screen.getByText('Beber 2,5 L de agua')).toBeTruthy()
  expect(screen.getByText('Entrenar')).toBeTruthy()
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
