# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

---

## Restricciones críticas del arnés de tests

El proyecto usa una configuración específica de Jest que **no puede cambiar** sin breaking el suite. Estas restricciones nacen de incompatibilidades reales en el ecosistema Expo 57 y aparecen en varias tareas; las documentamos aquí para que cualquier agente entienda el por qué.

### 1. Jest 29 obligatorio (no 30+)

**Restricción:** `jest@^29.7.0`

**Por qué:** `jest-expo@57.0.4` está construido y testado **solo** contra Jest 29. Sus peers (`@jest/globals`, `jest-environment-jsdom`, `jest-snapshot`, `babel-jest`) están fijados en `^29.2.1`. Jest 30 introdujo cambios en lifecycle de tests (runtime "winter" integración) y módulos duplicados que rompen la resolución de dependencias de jest-expo. Intentar upgraar Jest rompe la suite de tests de integración.

### 2. @testing-library/react-native en 13.x (no 14+)

**Restricción:** `@testing-library/react-native@^13.1.1`

**Por qué:** v14 de @testing-library/react-native importa un módulo llamado `test-renderer` (un alias de `react-test-renderer`), pero ese alias no existe en el árbol de dependencias de jest-expo@57. Sin él, Jest falla en tiempo de require con "Cannot find module 'test-renderer'". v13 es stable con jest-expo y no tiene ese requisito. Si futuras tareas necesitan APIs nuevas de v14, habrá que revisar todo el stack de Jest/Expo — no es un cambio puntual.

### 3. Configuración de Jest dividida (dos ficheros)

**Restricción:** 
- Configuración unitaria en `jest.config.js` (preset jest-expo, moduleNameMapper para test-renderer)
- Configuración integración en `jest.integracion.config.js` (preset diferente, conn pool PostgreSQL)
- NO incrustada en `package.json` (causa conflicto "multiple configurations")

**Por qué:** El `moduleNameMapper` solo es necesario para unitarios (mockea test-renderer), pero rompería las pruebas de integración que hablan con base datos real. Tener dos ficheros evita esa colisión. Jest rechaza múltiples configuraciones simultáneas si una está en package.json y otra en jest.config.js — la solución stable es que SOLO viva en jest.config.js.
