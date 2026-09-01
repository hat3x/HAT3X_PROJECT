# Tarea 5: Autenticación — correo y Apple | Informe de Implementación

## Qué se implementó

**Módulo de autenticación:** `apps/kaizen/src/datos/autenticacion.ts`
- `entrarConCorreo(correo, contrasena)` — autenticación con email/password vía Supabase Auth
- `registrarConCorreo(correo, contrasena)` — registro de nuevas cuentas
- `entrarConApple()` — Sign in with Apple, con integración de `expo-apple-authentication`
- `salir()` — cierre de sesión
- Todas devuelven `Promise<{ error: string | null }>` para consistencia

**Traducción de errores:**
- Módulo incluye mapa `MENSAJES` con traducciones de errores comunes de Supabase al español
- Fallback genérico en español para cualquier error no mapeado: *"No hemos podido completar la operación. Inténtalo de nuevo."*
- Función auxiliar `traducir(mensaje)` centraliza la lógica

**Dependencias instaladas:**
```
expo-apple-authentication@6.4.0
expo-auth-session@7.0.2
expo-web-browser@13.0.3
expo-crypto@13.0.2
```

## Evidencia de TDD

### Paso 1: Tests que fallan (antes de implementar)
```bash
$ npm test -- autenticacion.test
FAIL src/datos/autenticacion.test.ts
  ● Test suite failed to run
    Cannot find module './autenticacion' from 'src/datos/autenticacion.test.ts'
```

### Paso 2: Tests que pasan (después de implementar)
```bash
$ npm test -- autenticacion.test
PASS src/datos/autenticacion.test.ts
  √ devuelve error nulo cuando el acceso funciona (2 ms)
  √ traduce el error de credenciales a un mensaje en español
  √ salir llama a signOut (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### TypeScript strict
```bash
$ npx tsc --noEmit
(sin errores)
```

### Suite completa (14 tests)
```bash
$ npm test
PASS src/dominio/tipos.test.ts
PASS src/dominio/dia.test.ts
PASS src/datos/autenticacion.test.ts (NUEVO: 3/3 pasan)
PASS src/datos/sesion.test.tsx

Test Suites: 4 passed, 4 total
Tests:       14 passed, 14 total
```

## Ficheros modificados

```
M  apps/kaizen/package.json
M  apps/kaizen/package-lock.json
A  apps/kaizen/src/datos/autenticacion.ts       (implementación)
A  apps/kaizen/src/datos/autenticacion.test.ts  (tests)
```

Commit: `79f28f3` — `feat(kaizen): autenticacion con correo y Apple`

## Autorrevisión

### Implementación
- ✅ Cópialos verbatim aplicado: código idéntico al brief
- ✅ Sin JSX, sin pantallas: solo módulo de datos
- ✅ TypeScript strict: sin `any`, sin `@ts-ignore`
- ✅ Nombres en español: mensajes, comentarios, tipos
- ✅ Consumo de `supabase` (Task 4): correcto, usando `supabase.auth.*`
- ✅ Interfaz clara: `Resultado` reutilizable

### Tests
- ✅ TDD verificado: fallan antes, pasan después
- ✅ Coverage de comportamiento: 3 casos
  - Éxito sin error (`error: null`)
  - Traducción de errores conocidos (credenciales)
  - Llamada a `signOut`
- ⚠️ **Ajuste necesario:** Variables de mock renombradas a `mockSignInWithPassword`/`mockSignOut` para cumplir restricción de Jest (prefijo `mock` obligatorio en scope de `jest.mock()`)

### Calidad
- ✅ `npm test` limpio: 14/14 pasan
- ✅ `npx tsc --noEmit` limpio: sin errores de tipo
- ✅ Git: solo rutas de `apps/kaizen/`, no commit de otros proyectos
- ✅ Dependencias: no se subieron versiones críticas de `jest@29`, `@testing-library/react-native@13.x`

## Preocupaciones y notas para revisión

### 1. **Manejo de error en `entrarConApple()` — cancelación silenciosa**
```ts
catch {
  return { error: null } // el usuario canceló
}
```
**Esto es intencional según el brief**, pero crea un problema de seguridad conceptual:
- Si Apple authentication lanza una excepción por razones **distintas** de cancelación del usuario (ej: network timeout, error de API, bug), se devuelve `error: null` sin distinción
- El UI nunca sabrá que pasó algo malo
- **Recomendación:** Considerar en revisión si una próxima iteración debería distinguir tipos de error dentro del `catch`

Esto está documentado en el brief como comportamiento esperado, así que se implementa tal cual.

### 2. **Traducción de errores — cobertura limitada**
El mapa `MENSAJES` solo cubre dos casos:
- `'Invalid login credentials'` (sign-in con credenciales incorrectas)
- `'User already registered'` (registro a cuenta existente)

Cualquier otro error de Supabase devuelve el fallback genérico en español. **Esto es correcto** — los errores específicos se pueden añadir en futuras iteraciones cuando los casos reales se encuentren.

### 3. **Google queda fuera (según brief)**
No se implementó `entrarConGoogle()`. El brief explica que requiere credenciales OAuth que todavía no existen. Esto es correcto: ni código ni esbozo a medias, simplemente no está.

## Síntesis de resultados

| Métrica | Estado |
|---------|--------|
| Tests unitarios | 3/3 ✅ |
| Tests total suite | 14/14 ✅ |
| TypeScript strict | ✅ Sin errores |
| Cobertura TDD | ✅ Fallan → Pasan |
| Git scope (solo kaizen) | ✅ Cumplido |
| Restricciones Jest/Expo | ✅ Respetadas |
| Especias de riesgos | ⚠️ Error handling en Apple (esperado) |

## Checklist de entrega

- [x] Módulo `autenticacion.ts` implementado (100% spec)
- [x] Tests `autenticacion.test.ts` implementados y pasando
- [x] `npm test` verde (14/14)
- [x] `npx tsc --noEmit` verde
- [x] Git commit con paths explícitos (apps/kaizen/*)
- [x] Sin JSX, sin pantalla
- [x] Sin Google (fuera de scope)
- [x] Español en todos los mensajes de error
- [x] Autorrevisión completada

---

## RONDA 1 DE ARREGLOS — Hallazgos 1-3

**Commit:** `661465a` — `fix(kaizen): autenticacion — arreglos hallazgo 1-3`

### Hallazgo 1 (IMPORTANTE): `entrarConApple` trataba cualquier excepción como cancelación

**Problema original:**
```ts
catch {
  return { error: null } // el usuario canceló
}
```
Esto ocultaba fallos reales (sin Apple configurado, diálogo revotado, etc.) como si fuera cancelación.

**Solución aplicada:**
- `try` envuelve SOLO el diálogo nativo (`AppleAuthentication.signInAsync`)
- Función `esCancelacion(fallo)` detecta exactamente `code === 'ERR_REQUEST_CANCELED'` (Expo discriminador exacto)
- Cancelación devuelve `{ error: null }` ✅
- Cualquier otro fallo (`ERR_APPLE_AUTHENTICATION_UNAVAILABLE`, etc.) devuelve mensaje útil
- Fallos de Supabase (network, etc.) ya no se enmascarán como cancelación

**Verificación:** Tests `cancelar NO es un error` y `un fallo que no es cancelación sí avisa al usuario` están en verde.

### Hallazgo 2 (IMPORTANTE): `registrarConCorreo` y `entrarConApple` no tenían tests

**Problema original:**
- `registrarConCorreo` sin cobertura → fallos en wild sin detectarse
- `entrarConApple` sin cobertura → hallazgo 1 no se notaba porque no había test que lo expusiera

**Solución aplicada:**
Agregados 8 tests nuevos (ahora 11 totales):
```
✓ registrar traduce que el correo ya existe (code: email_exists)
✓ registrar da un consejo accionable si la contraseña es débil (code: weak_password)
✓ un error desconocido nunca deja pasar el texto en inglés
describe('entrarConApple'):
  ✓ cancelar NO es un error
  ✓ un fallo que no es cancelación sí avisa al usuario
  ✓ avisa si Apple no devuelve token
  ✓ un fallo de Supabase no se disfraza de cancelación
  ✓ con token válido y Supabase conforme, entra
```

**Verificación:** `npm test -- autenticacion.test` → 11/11 ✅

### Hallazgo 3 (IMPORTANTE): Mensaje genérico engañoso

**Problema original:**
```ts
return 'No hemos podido completar la operación. Inténtalo de nuevo.'
```
Decir "inténtalo de nuevo" a un usuario con contraseña corta o correo malformado es contraproducente. Reintentar lo mismo fallará igual.

**Solución aplicada:**
Reestructuración de `traducir(error: AuthError)`:
- Mapeo por `code` primero (POR_CODIGO): los códigos GoTrue no cambian entre versiones, los textos sí
- Fallback por `message` (POR_MENSAJE): compatibilidad con versiones que no envían código
- Fallback final: **sin "inténtalo de nuevo" a secas**

```ts
const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_exists: 'Ya existe una cuenta con ese correo.',
  weak_password: 'La contraseña es demasiado corta. Usa al menos 6 caracteres.',
  validation_failed: 'Revisa el correo: no tiene un formato válido.',
  email_not_confirmed: 'Todavía no has confirmado tu correo. Mira tu bandeja de entrada.',
  over_email_send_rate_limit: 'Has pedido demasiados correos seguidos. Espera un minuto.',
}
```

Fallback: `'No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.'`

**Verificación:** Test `un error desconocido nunca deja pasar el texto en inglés` pasa ✅

### Suite post-arreglos

```bash
$ npm test
PASS src/dominio/tipos.test.ts
PASS src/dominio/dia.test.ts
PASS src/datos/autenticacion.test.ts  (11/11 ✅)
PASS src/datos/sesion.test.tsx

Test Suites: 4 passed, 4 total
Tests:       22 passed, 22 total
```

### Notas técnicas

- ✅ `AuthError` sí expone `code` en versión `@supabase/supabase-js@^2.112.3` instalada
- ✅ Sin `any`, sin `@ts-ignore` — `catch` recibe `unknown` y se checkea forma
- ✅ Restricciones Jest/Expo respetadas: jest 29, RNTL 13.x, `mock` prefixes
- ✅ TypeScript: `npx tsc --noEmit` limpio
- ✅ Git: solo rutas de `apps/kaizen/`

---

**Pronto:** Tarea 9 integrará este módulo en la pantalla de acceso cuando existan los componentes del sistema de diseño.
