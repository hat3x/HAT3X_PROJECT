## Tarea 1: Proyecto Expo, TypeScript estricto y arnés de tests

**Ficheros:**
- Crear: `apps/kaizen/` (proyecto completo)
- Crear: `apps/kaizen/src/dominio/tipos.ts`
- Test: `apps/kaizen/src/dominio/tipos.test.ts`

**Interfaces:**
- Produce: proyecto ejecutable con `npm test` y `npx tsc --noEmit` funcionando.

- [ ] **Paso 1: Crear el proyecto**

```bash
cd apps
npx create-expo-app@latest kaizen --template blank-typescript
cd kaizen
```

- [ ] **Paso 2: Instalar Expo Router y el arnés de tests**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npm install --save-dev jest-expo jest @types/jest @testing-library/react-native
```

- [ ] **Paso 3: Configurar `package.json`**

Añadir/ajustar estas claves:

```json
{
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "test": "jest",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Paso 4: Activar TypeScript estricto**

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

En `app.json`, dentro de `expo`, añadir `"scheme": "kaizen"`.

- [ ] **Paso 5: Escribir el test que prueba que el arnés funciona**

`src/dominio/tipos.test.ts`:

```ts
import { MOMENTOS, esMomento } from './tipos'

describe('momentos del día', () => {
  it('incluye los seis momentos', () => {
    expect(MOMENTOS).toEqual([
      'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
    ])
  })

  it('reconoce un momento válido', () => {
    expect(esMomento('cena')).toBe(true)
  })

  it('rechaza un valor que no es un momento', () => {
    expect(esMomento('brunch')).toBe(false)
  })
})
```

- [ ] **Paso 6: Ejecutar el test y comprobar que falla**

Ejecutar: `npm test`
Esperado: FALLA con «Cannot find module './tipos'».

- [ ] **Paso 7: Implementar el mínimo**

`src/dominio/tipos.ts`:

```ts
export const MOMENTOS = [
  'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
] as const

export type Momento = (typeof MOMENTOS)[number]

export function esMomento(valor: string): valor is Momento {
  return (MOMENTOS as readonly string[]).includes(valor)
}
```

- [ ] **Paso 8: Ejecutar el test y comprobar que pasa**

Ejecutar: `npm test` → PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 9: Comitear**

```bash
git add apps/kaizen
git commit -m "feat(kaizen): proyecto Expo con TypeScript estricto y arnes de tests"
```

---

