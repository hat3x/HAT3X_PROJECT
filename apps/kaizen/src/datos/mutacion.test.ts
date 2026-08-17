import { nuevoId } from './mutacion'

// `mutacion.ts` importa `./supabase`, que importa el módulo nativo de
// AsyncStorage. Bajo jest-expo (sin dispositivo real) esa carga revienta con
// «NativeModule: AsyncStorage is null». Este test solo ejercita `nuevoId()`,
// que no toca Supabase, así que basta con vaciar el módulo para que cargue.
// Mismo patrón que ya usan autenticacion.test.ts y sesion.test.tsx.
jest.mock('./supabase', () => ({ supabase: {} }))

// El mock nativo autogenerado de expo-crypto (node_modules/expo-crypto/mocks)
// no implementa `randomUUID`: devuelve `undefined`. Se sustituye por el
// `randomUUID` real de Node, igual que autenticacion.test.ts mockea
// expo-apple-authentication con una implementación funcional en vez de dejar
// pasar el stub vacío de Expo.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}))

it('genera identificadores únicos con forma de UUID', () => {
  const a = nuevoId()
  const b = nuevoId()
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  expect(a).not.toBe(b)
})
