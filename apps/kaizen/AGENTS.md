# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

---

## Antes de dar una pantalla por buena, MÍRALA

```
npx expo start --web --port 8099    # dejarlo levantado
npm run capturas                     # un PNG por ruta en capturas/
KAIZEN_TEMA=claro npm run capturas   # la otra piel
```

`scripts/captura.mjs` sirve la app en web, simula sesión en `localStorage`, **corta todo el tráfico hacia Supabase** —la base de este proyecto es la de producción— y responde con un perfil de ejemplo completo. Guarda una captura por ruta y lista los errores de consola de cada una.

**Por qué existe.** El bloque 0 se cerró con 65 pruebas en verde y once rondas de revisión, y llegó al móvil con los iconos de las pestañas en blanco y el fondo de las cuatro tarjetas del Home metido hacia dentro del borde redondeado. Ninguna prueba miraba la pantalla, así que ninguna lo vio. En su primera ejecución, el arnés lo encontró.

Tres reglas que salieron de usarlo:

1. **Si el arnés devuelve datos vacíos, fabrica fallos que no existen.** Con `[]` en todas las respuestas, el `.single()` del perfil se traga el array y Ajustes se pinta con la zona horaria en blanco y nada seleccionado. Parecen tres bugs y no lo son. Por eso `PERFIL_DE_EJEMPLO` lleva todos los campos con valor.
2. **Lo que web NO ve:** el margen seguro (en el navegador no hay barra de estado, el contexto entrega cero) y la fidelidad del desenfoque. Eso va cubierto con pruebas —ver «margen seguro» en `componentes.test.tsx`— o no va cubierto.
3. **Web y Android ignoran en silencio algunas props que iOS sí respeta.** `contentOffset` de `ScrollView` es una: el arreglo parecía puesto y la captura salía idéntica. Se usa `ref` + `scrollTo`.

No hay emulador de Android disponible: los AVDs existen pero sin imagen de sistema, y no cabe en disco.

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

### 4. Toda mutación nueva necesita `mutationKey` + `setMutationDefaults`

**Restricción:** cualquier `useMutation()` que escriba datos de usuario debe declarar `mutationKey`, y su `mutationFn` debe registrarse también con `clienteConsultas.setMutationDefaults(clave, { mutationFn })` en `src/datos/cliente-consultas.ts` (o donde se cree el `QueryClient`), de forma síncrona al crearlo — nunca dentro de un componente que se monte después de que `PersistQueryClientProvider` rehidrate el estado persistido.

**Por qué:** el persistidor de la cola offline (`@tanstack/query-async-storage-persister`) guarda una mutación pausada con su `mutationKey`, su `state` y sus metadatos — **nunca la función**. Al rehidratar, `resumePausedMutations()` solo puede reconstruir un `mutationFn` ejecutable si encuentra unos defaults registrados para esa `mutationKey` (`QueryClient.getMutationDefaults`). Sin `mutationKey`, o con el registro llegando tarde, la mutación reconstruida se queda sin función; `resumePausedMutations()` la ejecuta igual, falla con «No mutationFn found», y ese rechazo lo traga un `catch` interno de la propia librería — el cambio se pierde sin ningún aviso en pantalla. Pasó con la única mutación de usuario que había en el bloque 0 (guardar ajustes del perfil) y nadie lo detectó hasta una revisión final expresa: este agujero solo estaba anotado en la bitácora del proceso, no aquí. Que no vuelva a pasar con la siguiente mutación.
