import { screen, waitFor } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'

// Monta el layout raíz DE VERDAD —vía `renderRouter`, que construye el árbol
// de rutas real de `src/app` sobre `ExpoRoot`— en vez de una pantalla suelta
// como hace el resto del suite. Es el hueco que dejó escapar el hallazgo A
// (bloqueante) durante once rondas de revisión: ningún test montaba nunca el
// navegador de la raíz, así que nada notaba que la rama sin sesión no
// renderizaba ninguno.
//
// Vive fuera de `src/app/` a propósito: `renderRouter` escanea esa carpeta
// como árbol de rutas real, y cualquier fichero dentro —incluido un test—
// se registra como ruta. Un test llamado `_layout.test.tsx` colocado ahí
// dentro choca literalmente con `_layout.tsx` («The layouts... conflict on
// the route "/_layout"»); comprobado al escribir este fichero.
//
// Prefijo `mock` obligatorio: el plugin de hoisting de Jest sube
// `jest.mock()` por encima de las declaraciones normales y su factoría no
// puede referenciar variables fuera de su alcance salvo que empiecen por
// «mock». Mismo patrón que sesion.test.tsx y usar-perfil.test.tsx.
const mockGetSession = jest.fn()
const mockOnAuthStateChange = jest.fn()
const mockPerfilSelectUnico = jest.fn()

// `src/datos/cliente-consultas.ts` importa estos dos módulos nativos para el
// persistidor offline y el detector de conectividad. Ningún test anterior
// los necesitaba (nadie montaba `_layout.tsx` hasta este fichero), así que
// no había mock activo: sin él, `AsyncStorage` revienta con «NativeModule:
// AsyncStorage is null» en cuanto se importa fuera de un dispositivo real.
// Mocks oficiales de cada paquete, mismo patrón que el resto del repo usa
// para dependencias nativas.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
)

jest.mock('@/datos/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
    },
    from: () => ({
      select: () => ({ single: () => mockPerfilSelectUnico() }),
    }),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  })
  // Sin sesión no se llega a consultar el perfil (`usarPerfil` la deja
  // `enabled: false`), pero se deja un valor por si algún camino la dispara.
  mockPerfilSelectUnico.mockResolvedValue({ data: null, error: null })
})

// `renderRouter` deja temporizadores falsos activos (`jest.useFakeTimers()`,
// ver expo-router/build/testing-library/index.js). Sin restaurarlos aquí, el
// worker de Jest no cierra limpio al terminar este fichero.
afterEach(() => {
  jest.useRealTimers()
})

it('sin sesión, el navegador se monta y se llega a la pantalla de acceso (no una pantalla en blanco)', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } })

  renderRouter('src/app', { initialUrl: '/' })

  await waitFor(() => expect(screen.getByText('Entrar en KAIZEN')).toBeTruthy())
  // No se cuela por la rama de sesión: el armazón de pestañas no está.
  expect(screen.queryByText(/buenos días/i)).toBeNull()
})

it('con sesión, se llega al armazón de pestañas', async () => {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
  })
  mockPerfilSelectUnico.mockResolvedValue({
    data: {
      id: 'u1', nombre: '', unidades: 'metrico', zona_horaria: 'Europe/Madrid',
      corte_dia: 4, hora_silencio: 22, tema: 'defecto',
    },
    error: null,
  })

  renderRouter('src/app', { initialUrl: '/' })

  // Contenido real de la pestaña activa (Hoy) Y la propia barra de pestañas:
  // ambas cosas solo existen si `(pestanas)/_layout.tsx` —el `Tabs` real— ha
  // llegado a montarse.
  await waitFor(() => expect(screen.getByText(/buenos días, jota/i)).toBeTruthy())
  expect(screen.getByText('Nutrición')).toBeTruthy()
})
