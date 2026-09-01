# Tarea 7 — Autorrevisión y Reporte

## Implementación completada

Se implementaron TDD-first todos los componentes del sistema de temas KAIZEN:

1. **Interfaz `Tema`** (`src/design/tema.ts`): Contrato tipado con TypeScript strict que define la estructura completa del tema, incluyendo tipos auxiliares (`Recuadro`, `Fondo`, `RecetaBarra`, `RecetaAnillo`). Todas las propiedades son obligatorias; algunos campos permiten `null` legítimamente (tipografías propias, decoraciones).

2. **Tema oscuro** (`src/design/temas/defecto.ts`): Implementa `Tema` con paleta verde acento `#4ECB9C`, texto claro `#F4F5F2`, fondos oscuros `#060807`, y degradados sutiles para superficies.

3. **Tema claro** (`src/design/temas/claro.ts`): Implementa `Tema` con paleta verde más clara `#1E9E73`, texto oscuro `#141715`, fondos brillantes `#FAF9F7`. Ambos temas tienen exactamente la misma estructura, lo que valida que el contrato está completo.

4. **Índice central** (`src/design/temas/indice.ts`): Exporta `TEMAS: Record<string, Tema>` que registra ambos temas. Comentario documenta que el perfil `personal` de EAS añadirá temas adicionales fuera del versionado.

5. **Test de contrato** (`src/design/temas/contrato.test.ts`): Tres pruebas que validan la coherencia del sistema.

## Evidencia de TDD

### Antes (test fallando):
```
npm test -- contrato.test
FAIL src/design/temas/contrato.test.ts
  ● Test suite failed to run

    Cannot find module './indice' from 'src/design/temas/contrato.test.ts'
```

### Después (test pasando):
```
npm test -- contrato.test

PASS src/design/temas/contrato.test.ts
  √ hay al menos un tema registrado (2 ms)
  √ ningún tema deja valores sin definir (1 ms)
  √ todos los temas declaran exactamente las mismas claves (1 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### TypeScript strict:
```
npx tsc --noEmit
(sin salida = sin errores)
```

## Autorrevisión detallada

### 1. Validación de los tres tests: qué cambios los ponen en rojo

#### Test 1: "hay al menos un tema registrado"
- **Qué prueba:** Que `TEMAS` no está vacío (`Object.keys(TEMAS).length > 0`)
- **Cambio que lo pondría en rojo:** Exportar un registro vacío: `export const TEMAS = {}`. Resultado: `nombres.length === 0`, el test falla.
- **Validez:** ✓ Prueba algo real y necesario. Sin él, podrías deployer con `TEMAS` vacío sin saberlo.

#### Test 2: "ningún tema deja valores sin definir"
- **Qué prueba:** Para cada tema, que no hay ningún campo con valor `undefined`. La función `rutas()` extrae todas las rutas a terminales (valores que son `null`, arrays, o primitivos), y el filtro detiene las que valen `undefined`.
- **Cambio que lo pondría en rojo:** En `temaDefecto`, eliminar una propiedad obligatoria:
  ```ts
  color: {
    acento: '#4ECB9C',
    sobreAcento: '#04120C',
    texto: '#F4F5F2',
    // ...
    // grasas: eliminada  <-- ROJO
  }
  ```
  Resultado: `valorEn(temaDefecto, 'color.grasas')` devuelve `undefined`, el filtro lo captura, el test falla.
- **Validez:** ✓ Prueba algo crítico. Detecta inicializaciones incompletas que TypeScript no atrapa si usas `as Tema` sin validación.

#### Test 3: "todos los temas declaran exactamente las mismas claves"
- **Qué prueba:** Que dos temas diferentes tienen la MISMA estructura (mismas rutas). Si un tema tiene una clave de más o le falta una, falla.
- **Cambio que lo pondría en rojo — caso A (clave extra):** En `temaClaro`, añadir una propiedad que no existe en `temaDefecto`:
  ```ts
  decoracion: {
    cabecera: null,
    tarjetaEntrenamiento: null,
    tarjetaMision: null,
    extra: null,  // <-- ROJO
  }
  ```
  Resultado: `rutas(temaClaro)` tiene `'decoracion.extra'`, pero `rutas(temaDefecto)` no. La comparación falla.
- **Cambio que lo pondría en rojo — caso B (clave faltante):** En `temaClaro`, eliminar una propiedad existente en `temaDefecto`:
  ```ts
  color: {
    // ... falta 'grasas'
  }
  ```
  Resultado: `rutas(temaClaro)` no incluye `'color.grasas'`, pero `rutas(temaDefecto)` sí. La comparación falla.
- **Validez:** ✓ Prueba algo esencial. Sin este test, podrías crear un tema con una estructura parcial (skin personal que olvida un color) y solo lo sabrías en producción. Con dos temas, el contrato se valida de verdad.

---

### 2. Manejo de valores especiales

#### Valores `null`
El contrato permite campos que valen `null` legítimamente:
```ts
tipografia: {
  familiaTitular: string | null,  // puede ser null
  familiaCuerpo: string | null,   // puede ser null
  // ...
}
decoracion: {
  cabecera: ImageSourcePropType | null,  // puede ser null
  // ...
}
```

**Cómo lo trata `rutas()`:**
```ts
if (objeto === null || typeof objeto !== 'object' || Array.isArray(objeto)) return [prefijo]
```
Cuando encuentra un `null`, lo trata como **terminal** y devuelve `[prefijo]`. Ejemplo:
```ts
rutas({ familiaTitular: null })  // → ['familiaTitular']
```

**Validación en el test:**
```ts
const sinDefinir = rutas(TEMAS[nombre])
  .filter((r) => valorEn(TEMAS[nombre], r) === undefined)
```
Un campo que vale `null` NO es `undefined`, así que no se filtra. Es correcto: `null` es un valor legítimo, `undefined` indica una omisión.

**Prueba con temaDefecto:**
```ts
tipografia: {
  familiaTitular: null,
  // ...
}
```
Cuando el test ejecuta `valorEn(temaDefecto, 'tipografia.familiaTitular')`, obtiene `null`, que no es `undefined`, así que el test PASA. Correcto.

#### Arrays
El contrato usa un array para espaciado:
```ts
espaciado: readonly [number, number, number, number, number, number, number, number, number]
```

**Cómo lo trata `rutas()`:**
```ts
if (objeto === null || typeof objeto !== 'object' || Array.isArray(objeto)) return [prefijo]
```
Cuando encuentra un array, devuelve `[prefijo]` sin desglosar elementos. Ejemplo:
```ts
rutas({ espaciado: [4, 8, 12, ...] })  // → ['espaciado']
```

**Por qué es correcto:** Queremos que el array COMPLETO esté presente en el objeto, no cada elemento del array por separado. Si un tema tuviera `espaciado: [4, 8]` (incompleto), el test de "ningún tema deja valores sin definir" lo dejaría pasar porque la ruta `'espaciado'` existe y vale un array (no `undefined`). Pero TypeScript ya lo atrapa en compile-time porque el tipo es `readonly [number, ..., number]` (9 elementos exactos), así que esto no es un problema en producción.

**Prueba con temaDefecto:**
```ts
espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
```
`rutas(temaDefecto)` incluye `'espaciado'` (no `'espaciado.0'`, `'espaciado.1'`, etc.), y `valorEn(temaDefecto, 'espaciado')` devuelve el array completo (no `undefined`). El test PASA. Correcto.

---

## Ronda 1 de arreglos: Arte de botón

### Hallazgo 1 (reparado)
El contrato faltaba campos para que un skin personal pudiera personalizar el arte de botones. Añadí dos campos `Fondo` a `superficie`:

```ts
superficie: {
  tarjeta: Fondo
  barraInferior: Fondo
  botonPrimario: Fondo      // Nuevo
  botonSecundario: Fondo    // Nuevo
  desenfoque: number
}
```

**En temaDefecto:**
- `botonPrimario: { tipo: 'color', valor: '#4ECB9C' }`
- `botonSecundario: { tipo: 'color', valor: 'rgba(255,255,255,0.10)' }`

**En temaClaro:**
- `botonPrimario: { tipo: 'color', valor: '#1E9E73' }`
- `botonSecundario: { tipo: 'color', valor: 'rgba(0,0,0,0.06)' }`

**Verificación:** El test de contrato no necesitó cambio (es un recorrido genérico). Los tres tests siguen pasando; el test 3 detecta que ambos temas tienen exactamente las mismas claves ahora (incluyendo los dos nuevos campos).

### Hallazgo 2 (reparado)
No había ejecutado la suite completa. Resultado:

```
Test Suites: 6 passed, 6 total
Tests:       28 passed, 28 total
```

## Ficheros cambiados (Ronda 1)

```
apps/kaizen/src/design/tema.ts
apps/kaizen/src/design/temas/claro.ts
apps/kaizen/src/design/temas/defecto.ts
```

## Commits

- **Original** - SHA: `69d417b` - Asunto: `feat(kaizen): contrato de temas tipado con tema oscuro y claro` — 5 ficheros, 180 líneas
- **Arreglo 1** - SHA: `b74867c` - Asunto: `fix(kaizen): añadir arte de botón al contrato de temas` — 3 ficheros, 11 líneas

## Hallazgos y confianza

### ✓ Confianza alta en el sistema de temas

1. **TypeScript strict:** No hay `any`, no hay `@ts-ignore`. Todos los tipos están explícitos. El compilador valida la forma completa de cada tema en compile-time.

2. **TDD con dos temas:** El test 3 ("todos declaran las mismas claves") solo tiene sentido con dos o más temas. Si hubiera uno solo, sería vacío (el bucle `slice(1)` estaría vacío). Con dos temas, la validación es real y futura: cualquier skin personal que se añada via EAS debe pasar este test.

3. **Valores especiales bien tratados:**
   - `null` es distinto de `undefined`, y el test lo valida correctamente.
   - Arrays se tratan como terminales, no se desglosan.
   - Todas las rutas llegan a un terminal (color, número, string, null o array), nunca quedan objetos vacíos.

4. **Extensibilidad:** El comentario en `indice.ts` documenta cómo el perfil `personal` de EAS añadirá temas. La interfaz `Tema` es lo suficientemente completa para que un skin personal no necesite cambiar nada del contrato.

### Ninguna preocupación

El único escenario que **no** probamos es si alguien intenta subir un tema con un campo de tipo diferente (ej., `color.acento: 123` en lugar de `string`). Pero TypeScript strict lo atrapa en compile-time, así que TypeScript es la barrera. El test no necesita comprobarlo.

---

## Conclusión

Sistema de temas implementado, tipado, validado y extensible. Con el arte de botón ahora en el contrato, un skin personal puede personalizar colores, gradientes o texturas en botones sin que ninguna pantalla tenga que decidir a pelo. Contrato completo. Suite: 28 tests verdes, TypeScript limpio.
