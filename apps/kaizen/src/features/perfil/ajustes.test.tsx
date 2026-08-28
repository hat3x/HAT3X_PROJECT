import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Ajustes } from './ajustes'
import { ProveedorTema } from '@/design/proveedor'
import { persistidor } from '@/datos/cliente-consultas'

// `cliente-consultas.ts` (vía `crearClienteConsultas`/`persistidor`) importa
// AsyncStorage y NetInfo. Mismo mock oficial que `layout-raiz.test.tsx`:
// ningún test anterior a esta ola los necesitaba.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
)

// Prefijo `mock` obligatorio: el hoisting de Jest sube `jest.mock()` por
// encima de las declaraciones normales, y su factoría no puede referenciar
// variables fuera de su alcance salvo que empiecen por «mock».
const mockSalir = jest.fn()
jest.mock('@/datos/autenticacion', () => ({
  salir: (...a: unknown[]) => mockSalir(...a),
}))

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

jest.mock('@/datos/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: 'u1', nombre: '', unidades: 'metrico', zona_horaria: 'Europe/Madrid',
              corte_dia: 4, hora_silencio: 22, tema: 'defecto',
            },
            error: null,
          }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))
jest.mock('@/datos/sesion', () => ({
  useSesion: () => ({ sesion: { user: { id: 'u1' } }, cargando: false }),
}))

function envolver(cliente: QueryClient) {
  return render(
    <QueryClientProvider client={cliente}>
      <ProveedorTema nombre="defecto">
        <Ajustes />
      </ProveedorTema>
    </QueryClientProvider>,
  )
}

beforeEach(() => jest.clearAllMocks())

// Cierra de un tiro el hallazgo B (un botón conectado a nada seguía sin
// guarda: nada renderiza `Ajustes`, así que nada notaría si el `alPulsar`
// de «Cerrar sesión» se desconectara), el camino de logout del hallazgo
// B.1 (la purga falla en silencio por construcción: si se rompe, no se
// pone rojo ningún test) y, en general, la clase «botón conectado a nada».
it('cerrar sesión llama a salir() y purga la caché local (clear + removeClient)', async () => {
  mockSalir.mockResolvedValue({ error: null })
  // Cliente de prueba, no `crearClienteConsultas()`: ese produccional trae
  // `gcTime: 24h` de verdad (temporizador real, no falso), que mantiene el
  // proceso de Jest vivo indefinidamente cuando este fichero se corre solo
  // (sin el pool de workers de la suite completa, que sí mata el proceso al
  // terminar). `persistidor` sigue siendo el real: es lo que hay que espiar.
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const espiaClear = jest.spyOn(cliente, 'clear')
  const espiaRemoveClient = jest.spyOn(persistidor, 'removeClient')

  envolver(cliente)

  await waitFor(() => expect(screen.getByText('Cerrar sesión')).toBeTruthy())
  fireEvent.press(screen.getByText('Cerrar sesión'))

  await waitFor(() => expect(mockSalir).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(espiaClear).toHaveBeenCalled())
  await waitFor(() => expect(espiaRemoveClient).toHaveBeenCalled())
})
