import { renderHook, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usarPerfil } from './usar-perfil'

// Prefijo `mock` obligatorio: el plugin de hoisting de Jest sube `jest.mock()`
// por encima de las declaraciones normales, y su factoría no puede referenciar
// variables fuera de su alcance salvo que empiecen por «mock» (sin distinguir
// mayúsculas). Sin el prefijo, esto falla en tiempo de transformación con
// «module factory... not allowed to reference any out-of-scope variables»,
// antes incluso de llegar a ejecutar un solo test.
const mockUpdate = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/datos/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ single: () => Promise.resolve({
        data: { id: 'u1', zona_horaria: 'Europe/Madrid', corte_dia: 4, hora_silencio: 22 },
        error: null,
      }) }),
      update: (cambios: unknown) => ({ eq: () => mockUpdate(cambios) }),
    }),
  },
}))
jest.mock('@/datos/sesion', () => ({ useSesion: () => ({ sesion: { user: { id: 'u1' } }, cargando: false }) }))

function envoltorio({ children }: { children: React.ReactNode }) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}

it('carga el perfil del usuario', async () => {
  const { result } = renderHook(() => usarPerfil(), { wrapper: envoltorio })
  await waitFor(() => expect(result.current.perfil?.corte_dia).toBe(4))
})

it('guarda solo los campos que cambian', async () => {
  const { result } = renderHook(() => usarPerfil(), { wrapper: envoltorio })
  await waitFor(() => expect(result.current.perfil).not.toBeNull())
  await act(() => result.current.guardar({ corte_dia: 6 }))
  expect(mockUpdate).toHaveBeenCalledWith({ corte_dia: 6 })
})
