import { hydrate, type QueryClient } from '@tanstack/react-query'
import { crearClienteConsultas } from './cliente-consultas'
import { CLAVE_MUTACION_GUARDAR_PERFIL } from './claves-mutacion'

// `cliente-consultas.ts` importa AsyncStorage y NetInfo (persistidor offline
// y detector de conectividad). Mismo mock oficial que el resto de tests que
// tocan este módulo.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
)
jest.mock('./supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, from: () => ({ update: () => ({ eq: jest.fn() }) }) },
}))

// `crearClienteConsultas()` trae un `gcTime` real de 24h: al construir una
// mutación, `Mutation` (vía `Removable`) programa un `setTimeout` real con
// esa duración para su recolección. `clienteConsultas.clear()` no lo cancela
// (solo vacía la caché, no llama a `destroy()` en cada mutación) — sin este
// `afterEach`, el proceso de Jest no cierra nunca al correr este fichero
// suelto (sí lo hace dentro de la suite completa, porque el pool de workers
// mata el proceso al terminar de todos modos).
let cliente: QueryClient | undefined

afterEach(() => {
  cliente?.getMutationCache().getAll().forEach((mutacion) => mutacion.destroy())
  cliente?.clear()
  cliente = undefined
})

// Fija la igualdad entre la clave que `usar-perfil.ts` usa para declarar su
// mutación y la que `crearClienteConsultas` usa para registrar sus defaults:
// es justo la parte que se pudre en silencio si alguien cambia una de las
// dos sin tocar la otra — ningún tipo lo detecta, `getMutationDefaults`
// compara por valor (`hashKey`/`partialMatchKey`), no por identidad de
// módulo. Reproduce a mano lo mismo que hace el persistidor real: una
// mutación se "rehidrata" con clave + estado, nunca con su función.
it('una mutación de guardar-perfil rehidratada recupera su mutationFn de los defaults', () => {
  cliente = crearClienteConsultas()

  hydrate(cliente, {
    mutations: [
      {
        mutationKey: CLAVE_MUTACION_GUARDAR_PERFIL,
        state: {
          status: 'pending',
          isPaused: true,
          variables: { id: 'u1', cambios: {} },
          context: undefined,
          data: undefined,
          error: null,
          failureCount: 0,
          failureReason: null,
          submittedAt: Date.now(),
        },
      },
    ],
    queries: [],
  })

  const [mutacionRehidratada] = cliente.getMutationCache().getAll()
  expect(mutacionRehidratada?.options.mutationFn).toBeInstanceOf(Function)
})
