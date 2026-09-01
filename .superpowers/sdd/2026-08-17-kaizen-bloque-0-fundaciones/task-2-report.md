# Tarea 2: Dominio — el día local — REPORTE

## Qué implementé

Creé dos archivos en `apps/kaizen/src/dominio/`:

1. **`dia.ts`** — Función `fechaLocal(instante: Date, zonaHoraria: string, corteHora: number): string`
   - Devuelve la fecha `'YYYY-MM-DD'` al que cuenta un registro según su zona horaria y corte de día
   - Ajusta el timestamp restando `corteHora * 3_600_000` milisegundos
   - Usa `Intl.DateTimeFormat` con `en-CA` y `timeZone` para obtener la fecha local
   - Código puro, sin React ni Supabase

2. **`dia.test.ts`** — 5 casos de prueba TDD
   - Comida de mediodía cuenta en su propio día
   - Cena a las 01:30 cuenta como el día anterior (corte a las 4)
   - A las 04:30 ya cuenta como el día nuevo (corte a las 4)
   - Con corte a 0 la medianoche parte el día
   - El mismo instante da días distintos en zonas distintas

## Evidencia de TDD

### Paso 1-2: Tests fallando

```bash
$ npm test -- dia.test
FAIL src/dominio/dia.test.ts
  ● Test suite failed to run

    Cannot find module './dia' from 'src/dominio/dia.test.ts'
```

### Paso 3-4: Tests pasando

```bash
$ npm test -- dia.test
PASS src/dominio/dia.test.ts
  fechaLocal
    √ una comida de mediodía cuenta en su propio día (13 ms)
    √ una cena a la 01:30 cuenta como el día anterior con corte a las 4
    √ a las 04:30 ya cuenta como el día nuevo con corte a las 4 (1 ms)
    √ con corte a 0 la medianoche parte el día
    √ el mismo instante da días distintos en zonas distintas (1 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

### Paso 5: TypeScript limpio

```bash
$ npx tsc --noEmit
(sin output = limpio)
```

## Suite de tests completa

```bash
$ npm test
PASS src/dominio/dia.test.ts
PASS src/dominio/tipos.test.ts

Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
Time:        1.002 s
Ran all test suites.
```

## Ficheros cambiados

- `apps/kaizen/src/dominio/dia.ts` — creado (22 líneas)
- `apps/kaizen/src/dominio/dia.test.ts` — creado (33 líneas)

## Commit

```
commit ad5b77c043019495847589c62b966733c86cf8e8
Author: HAT3X Command <info@hat3x.com>
Date:   Mon Aug 17 14:39:50 2026 +0200

    feat(kaizen): calculo del dia local con corte configurable

 apps/kaizen/src/dominio/dia.test.ts | 32 ++++++++++++
 apps/kaizen/src/dominio/dia.ts       | 21 ++++++++
 2 files changed, 53 insertions(+)
```

## Autorrevisión

✓ Nombres en español: `fechaLocal`, `instante`, `zonaHoraria`, `corteHora`, `desplazado`, `formateador`
✓ TypeScript estricto: tipos explícitos, sin `any`, sin `@ts-ignore`
✓ Dominio puro: no importa React ni Supabase
✓ Tests copíados verbatim del brief, todos los casos de zona horaria incluidos
✓ Implementación correcta: desplaza el timestamp por `corteHora * 3_600_000` ms antes de aplicar timeZone
✓ Formato correcto: usa `en-CA` para garantizar `YYYY-MM-DD`

## Polyfill

No fue necesario instalar `@formatjs/intl-datetimeformat`. Los tests pasaron sin él, indicando que la plataforma (Windows 11 + Node.js) ya trae datos de zonas horarias.

## Hallazgos

- La lógica de "corte de día" se implementa correctamente con el desplazamiento negativo del timestamp antes de aplicar la zona horaria. Esto es más limpio que hacer aritmética post-formato.
- Los 5 casos de prueba cubren: día normal, cena tarde, madrugada, límite de corte a 0, y zonas geográficas distintas. Son suficientes para verificar la función.

---

# Ronda de arreglos 1 — Corrección DST

## El hallazgo (coordinador)

La implementación original desplazaba el instante absoluto por `-corteHora * 3_600_000` ms y luego formateaba. Esto funciona en la mayoría de casos, pero falla en los dos cambios de hora del año (DST - Daylight Saving Time), porque la ventana desplazada cruza la transición de horario y el desfase que se aplica al formatear ya no es el que regía en el instante original.

**Contraejemplo verificado:** 03:30 hora local de Madrid del 2026-10-25 (antes del corte de las 4) debe contar como 2026-10-24. La función devolvía 2026-10-25 (incorrecto).

## Qué cambié

Reemplazé el algoritmo de desplazamiento absoluto por uno que razona sobre el reloj de pared local:

1. **`formatToParts`** con `hourCycle: 'h23'` extrae año, mes, día y hora de la zona horaria
2. **Construye fecha de calendario** UTC con esas partes (antes de mover ningún reloj absoluto)
3. **Si la hora local < corteHora**, resta un día de la fecha de calendario
4. **Devuelve YYYY-MM-DD** sin tocar nunca un instante absoluto

**Código nuevo (38 líneas vs 22 antiguas):**
- Extrae la función `valor()` tipada que busca partes por tipo con manejo explícito de `undefined`
- Documenta en JSDoc **por qué** no se desplaza el instante absoluto (previene reintroducción del atajo)
- Documenta que `corteHora` se espera 0-12 (validación en DB en Tarea 3)

## Evidencia de corrección

### Tests fallando inicialmente (2 nuevos casos DST)

```bash
$ npm test -- dia.test
FAIL src/dominio/dia.test.ts
  ● fechaLocal › el cambio de hora de otoño no adelanta el día
    Expected: "2026-10-24"
    Received: "2026-10-25"

  ● fechaLocal › el cambio de hora de primavera no atrasa el día
    Expected: "2026-03-29"
    Received: "2026-03-28"

Tests:  2 failed, 5 passed, 7 total
```

### Todos los tests pasando (5 originales + 2 DST)

```bash
$ npm test -- dia.test
PASS src/dominio/dia.test.ts
  fechaLocal
    √ una comida de mediodía cuenta en su propio día (13 ms)
    √ una cena a la 01:30 cuenta como el día anterior con corte a las 4
    √ a las 04:30 ya cuenta como el día nuevo con corte a las 4 (1 ms)
    √ con corte a 0 la medianoche parte el día
    √ el mismo instante da días distintos en zonas distintas (1 ms)
    √ el cambio de hora de otoño no adelanta el día
    √ el cambio de hora de primavera no atrasa el día

Tests:  7 passed, 7 total
```

### Suite completa en verde

```bash
$ npm test
PASS src/dominio/dia.test.ts
PASS src/dominio/tipos.test.ts

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Time:        0.984 s
```

### TypeScript limpio

```bash
$ npx tsc --noEmit
(sin output = limpio)
```

## Ficheros modificados

- `apps/kaizen/src/dominio/dia.ts` — 38 líneas (fue 22), reescrita completamente con nuevo algoritmo
- `apps/kaizen/src/dominio/dia.test.ts` — 48 líneas (fue 32), +2 tests de DST

## Commit

```
commit b3c12e9
Author: HAT3X Command <info@hat3x.com>
Date:   Mon Aug 17 14:45:22 2026 +0200

    fix(kaizen): calculo del dia local - manejo correcto de cambios de hora DST

 apps/kaizen/src/dominio/dia.test.ts | 16 ++++++++++++++++
 apps/kaizen/src/dominio/dia.ts       | 24 ++++++++++++++++++------
 2 files changed, 40 insertions(+), 4 deletions(-)
```

## Decisiones de tipo

- **`valor()` tipada sin aserciones no nulas:** `formatToParts` puede devolver `undefined` en partes; se maneja explícitamente con throw (opción segura vs. aserciones silenciosas)
- **`Intl.DateTimeFormatPartTypes` correcto:** el tipo de `tipo` es exacto del API de Intl
- **Métodos de fecha UTC:** `Date.UTC()` y `setUTCDate()` para evitar desfases de zona en la aritmética de calendario
