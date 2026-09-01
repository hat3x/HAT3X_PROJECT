# Informe — Tarea 1: Proyecto Expo, TypeScript estricto y arnés de tests

## Estado: DONE_WITH_CONCERNS

Todo lo pedido en el brief quedó implementado y verificado (`npm test` en verde, `npx tsc --noEmit` limpio, commit acotado a `apps/kaizen`). Marco "concerns" porque tuve que resolver tres incompatibilidades reales de versiones en el ecosistema Expo SDK 57 / Jest que el brief no anticipaba, y una de ellas obligó a añadir una clave (`"types": ["jest"]`) al `tsconfig.json` que el brief especificaba como contenido verbatim. Detallo todo abajo para que se pueda revisar la decisión.

## Qué implementé

1. **Proyecto Expo** creado con `npx create-expo-app@latest kaizen --template blank-typescript` dentro de `apps/`. Expo ~57.0.14, React 19.2.3, React Native 0.86.2. Sin repo git anidado (respondió "skip" al prompt de git init).
2. **Expo Router + arnés de tests** instalados: `expo-router`, `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, `expo-constants`, `expo-status-bar` (vía `npx expo install`), y `jest-expo`, `jest`, `@types/jest`, `@testing-library/react-native` (vía `npm install --save-dev`).
3. **`package.json`**: `main` cambiado a `"expo-router/entry"`; añadidos los scripts `dev`, `test`, `test:watch`, `typecheck` (conservando `start`/`android`/`ios`/`web` del scaffold); añadida la clave `"jest": { "preset": "jest-expo" }`.
4. **`tsconfig.json`**: `strict: true`, `noUncheckedIndexedAccess: true`, alias `@/*` → `./src/*`, `include` con los cuatro patrones del brief. Añadido además `"types": ["jest"]` (ver "Desviación del brief" abajo).
5. **`app.json`**: añadido `"scheme": "kaizen"` dentro de `expo` (el resto del bloque `expo` es el que generó el scaffold; `npx expo install` añadió también un array `"plugins": ["expo-router", "expo-status-bar"]`, efecto secundario normal de esa instalación).
6. **`src/dominio/tipos.ts`** y **`src/dominio/tipos.test.ts`**: contenido exactamente como en el brief, verbatim.
7. **`.npmrc`** (`legacy-peer-deps=true`) — fichero nuevo, no pedido por el brief, necesario para que `npm install` no falle por conflictos de peer dependencies del propio Expo Router 57 (ver abajo).

## TDD — evidencia

**Paso 6 del brief — test en rojo, antes de implementar `tipos.ts`:**

Comando: `npm test` (con `src/dominio/tipos.test.ts` ya escrito y `tipos.ts` inexistente)

```
> kaizen@1.0.0 test
> jest

FAIL src/dominio/tipos.test.ts
  ● Test suite failed to run

    Cannot find module './tipos' from 'src/dominio/tipos.test.ts'

    However, Jest was able to find:
        './tipos.test.ts'
    ...
Test Suites: 1 failed, 1 total
Tests:       0 total
Snapshots:   0 total
```

Coincide exactamente con lo esperado por el brief ("FALLA con «Cannot find module './tipos'»").

**Paso 8 del brief — test en verde, tras implementar `tipos.ts`:**

Comando: `npm test`

```
> kaizen@1.0.0 test
> jest

PASS src/dominio/tipos.test.ts
  momentos del día
    √ incluye los seis momentos (2 ms)
    √ reconoce un momento válido
    √ rechaza un valor que no es un momento

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
```

Comando: `npx tsc --noEmit` → exit code 0, sin salida (sin errores).

Salida limpia en ambos casos, sin warnings sueltos.

## Ficheros cambiados (commit `aafc7b7`)

Todos bajo `apps/kaizen/` (20 ficheros, confirmado con `git diff --cached --name-only` antes de comitear — cero rutas fuera de `apps/kaizen/`):

- `apps/kaizen/.claude/settings.json`, `.gitignore`, `.npmrc`, `AGENTS.md`, `App.tsx`, `CLAUDE.md`, `LICENSE`, `app.json`, `index.ts`, `package-lock.json`, `package.json`, `tsconfig.json`
- `apps/kaizen/assets/*` (6 iconos del scaffold)
- `apps/kaizen/src/dominio/tipos.ts`, `src/dominio/tipos.test.ts`

`node_modules/` correctamente excluido por el `.gitignore` que genera el propio scaffold de Expo.

## Desviaciones del brief (con justificación) — para tu revisión

El brief pide seguir los pasos "verbatim" y no improvisar variantes. Me encontré con tres bloqueos reales de entorno (no decisiones de diseño con varias respuestas válidas) que impedían llegar al criterio de aceptación explícito del brief ("Produce: proyecto ejecutable con `npm test` y `npx tsc --noEmit` funcionando"). Los resolví con el mínimo cambio necesario en cada caso:

1. **`ERESOLVE` al instalar el arnés de tests** (Paso 2). `expo-router@57.0.14` arrastra `@expo/ui`/`vaul`/`@radix-ui/*` que exigen `react-dom@19.2.8`, mientras el scaffold fija `react@19.2.3`. Fix: añadí `apps/kaizen/.npmrc` con `legacy-peer-deps=true` (persistido, no solo el flag puntual, para que futuras tareas de KAIZEN no tropiecen con lo mismo al reinstalar).

2. **`jest-expo` pide `@react-native/jest-preset` como peer** que el brief no lista explícitamente (`jest-expo@57.0.4` ya no lo trae embebido). Fix: instalé `@react-native/jest-preset@^0.86.2` como devDependency — imprescindible para que `jest-expo` (pedido por el brief) funcione.

3. **`jest-expo@57.0.4` está construido contra Jest 29, no Jest 30.** Sus propias dependencias (`@jest/globals`, `jest-environment-jsdom`, `jest-snapshot`, `babel-jest`) están fijadas en `^29.2.1`. El brief no fija versión de `jest`, así que `npm install` cogió la última (30.4.2), lo que produjo dos fallos en cascada: primero un duplicado de `jest-environment-node`/`jest-mock` (por el rango `^29.7.0` que pide `@react-native/jest-preset`, incompatible con Jest 30) causando `TypeError: this._moduleMocker.clearMocksOnScope is not a function`; después, ya con ese primer síntoma resuelto vía overrides, un segundo fallo de ciclo de vida propio de Jest 30 (`ReferenceError: You are trying to 'require' a file outside of the scope of the test code`, en la integración del runtime "winter" de Expo). Diagnostiqué que la causa raíz común era la versión de Jest, así que en vez de seguir parcheando síntomas bajé `jest` a `^29.7.0` (línea que sí coincide con lo que `jest-expo` y `@react-native/jest-preset` esperan) y `@types/jest` a `^29.5.14` a juego. Con eso, la resolución de dependencias se destensó sola (sin duplicados, sin necesidad de `overrides`) y los tests pasan limpio.

4. **`tsconfig.json`: añadí `"types": ["jest"]`.** Con el `tsconfig.json` tal cual lo especifica el brief, `npx tsc --noEmit` fallaba con `TS2593: Cannot find name 'describe'` (y `it`, `expect`) en `tipos.test.ts` — la inclusión automática de `@types/*` de TypeScript no estaba recogiendo `@types/jest` (confirmé con `--listFiles` que `@types/react` sí entraba, pero solo por la cadena de imports de `jsx-runtime`, no por auto-inclusión ambiental; `@types/jest` no aparecía en absoluto). El propio compilador sugiere el fix exacto en el mensaje de error: *"add 'jest' ... to the types field in your tsconfig"*. Es el único cambio de los cuatro que toca directamente uno de los ficheros cuyo contenido el brief marcaba como verbatim, así que lo señalo aparte para que se revise explícitamente. Sin él, `npx tsc --noEmit` no queda limpio, que es el criterio de aceptación explícito de la tarea.

Ninguna de las cuatro decisiones es una elección arquitectónica con varias respuestas de producto válidas — son fixes mecánicos de compatibilidad de versiones para que las herramientas pedidas por el brief funcionen. Pero como el punto 4 toca contenido "verbatim", prefiero dejarlo marcado explícitamente en vez de darlo por bueno sin más.

## Autorrevisión

- Los nombres coinciden con lo pedido (`tipos.ts`, `tipos.test.ts`, `MOMENTOS`, `esMomento`, `Momento`), textos en español donde corresponde (nombres de fichero/carpeta `dominio`).
- No hay `any` ni `@ts-ignore` en el código que escribí.
- El test verifica comportamiento real (igualdad exacta del array de momentos, reconocimiento de un valor válido, rechazo de uno inválido) — no es un test trivial.
- No añadí nada no pedido en `tipos.ts`/`tipos.test.ts` (YAGNI respetado, contenido exactamente el del brief).
- Revisé que `AGENTS.md`, `CLAUDE.md` y `.claude/settings.json` son artefactos del propio scaffold oficial de `create-expo-app` (no los creé yo, no aparecen en otras apps del monorepo como `apps/atlas` porque son nuevos en esta versión de la plantilla de Expo) — los dejé tal cual, no es mi lugar limpiarlos sin que se me pida.
- Confirmé con `git diff --cached --name-only` antes de comitear que las 20 rutas estaban todas bajo `apps/kaizen/` y que el resto de los ~104 ficheros modificados de otros proyectos (biodental, denueveanueve, salon-os, memoria) siguieron intactos tras el commit.
- Salida de `npm test` y `npx tsc --noEmit` limpia, sin warnings colgando.

## Dudas / preocupaciones para quien revise

- El cambio de versión de `jest` (`^30.4.2` → `^29.7.0`) y de `@types/jest` (`^30.0.0` → `^29.5.14`) es una desviación de lo que produce literalmente el comando de instalación del Paso 2 tal cual está escrito en el brief (que no fija versión y por tanto coge la última). Si en las próximas 10 tareas de KAIZEN se depende de alguna API de Jest 30 específica, esto habría que revisitarlo — pero tal como está, Jest 30 no es utilizable con `jest-expo@57.0.4` en este momento (incompatibilidad real, no cosmética).
- `"types": ["jest"]` en `tsconfig.json` es la única desviación que toca contenido literal marcado como verbatim en el brief. La dejo señalada explícitamente por si se prefiere una solución distinta (p. ej. `/// <reference types="jest" />` en el test, que sí habría alterado el contenido "verbatim" del test en lugar del tsconfig — me pareció peor opción, pero es una alternativa).
- No he tocado `expo-env.d.ts` ni `.expo/types/` — no existen todavía porque no he ejecutado `expo start` (el brief no lo pide en esta tarea). Los patrones de `include` que los referencian en `tsconfig.json` simplemente no matchean nada por ahora; no es un problema, es el comportamiento esperado hasta que una tarea futura arranque el proyecto.
