import { useEffect } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Texto } from '@/design/componentes/texto'
import { temaDefecto } from '@/design/temas/defecto'
import { temaClaro } from '@/design/temas/claro'
import { ProveedorTemaDelPerfil } from './proveedor-tema-del-perfil'
import { usarPerfil, type Perfil } from './usar-perfil'

// Prefijo `mock` obligatorio: el plugin de hoisting de Jest sube `jest.mock()`
// por encima de las declaraciones normales, y su factoría no puede referenciar
// variables fuera de su alcance salvo que empiecen por «mock».
const mockPerfilFalso: Perfil = {
  id: 'u1', nombre: '', unidades: 'metrico', zona_horaria: 'Europe/Madrid',
  corte_dia: 4, hora_silencio: 22, tema: 'defecto',
}

// El mock devuelve `perfilFalso` al leer y lo muta al escribir: así el
// refresco disparado por `invalidateQueries` trae de verdad el valor nuevo,
// igual que ocurriría contra Supabase real.
jest.mock('@/datos/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ single: () => Promise.resolve({ data: { ...mockPerfilFalso }, error: null }) }),
      update: (cambios: Partial<Perfil>) => ({
        eq: () => {
          Object.assign(mockPerfilFalso, cambios)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))
jest.mock('@/datos/sesion', () => ({ useSesion: () => ({ sesion: { user: { id: 'u1' } }, cargando: false }) }))

// Referencia capturada desde dentro de `Sonda`, para disparar `guardar` desde
// el test sin acoplar la aserción a ningún control concreto de la pantalla
// real de ajustes — lo que se prueba aquí es la cadena, no un botón.
let guardarDesdeLaSonda: ((cambios: Partial<Perfil>) => Promise<void>) | null = null

function Sonda() {
  const { guardar } = usarPerfil()
  useEffect(() => {
    guardarDesdeLaSonda = guardar
  })
  return <Texto>sonda</Texto>
}

describe('el cambio de tema se propaga sin reiniciar la app', () => {
  beforeEach(() => {
    mockPerfilFalso.tema = 'defecto'
    guardarDesdeLaSonda = null
  })

  // Prueba la cadena entera menos la red: guardar → invalidar → releer →
  // re-renderizar el proveedor → color nuevo en pantalla, sin remontar nada.
  // Es el criterio central de la Tarea 11: si esto se pone rojo, el selector
  // de tema de la pantalla de ajustes ha dejado de funcionar de verdad.
  it('cambiar el tema se ve al instante, sin reiniciar', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={cliente}>
        <ProveedorTemaDelPerfil>
          <Sonda />
        </ProveedorTemaDelPerfil>
      </QueryClientProvider>,
    )

    // Arranca con el tema oscuro guardado en el perfil.
    await waitFor(() =>
      expect(screen.getByText('sonda')).toHaveStyle({ color: temaDefecto.color.texto }))

    // El perfil pasa a tener el tema claro y se guarda.
    await act(async () => {
      await guardarDesdeLaSonda?.({ tema: 'claro' })
    })

    // Sin remontar: el mismo nodo tiene ya el color del tema claro.
    await waitFor(() =>
      expect(screen.getByText('sonda')).toHaveStyle({ color: temaClaro.color.texto }))
  })
})
