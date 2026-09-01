# Task 4 — Informe: Lógica pura de carta (precio efectivo + expansión de combo)

**STATUS:** DONE

**Commit:** `de655d72323b073ef79049a1ced33d9b2a111b82` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`)

## Ficheros creados

- `clients/projects/salon-os/src/lib/restauracion/menu.ts` (34 líneas)
- `clients/projects/salon-os/src/tests/unit/restauracion-menu.test.ts` (33 líneas)

Ambos son ficheros NUEVOS; el directorio `src/lib/restauracion/` no existía y se creó en este paso.

## Flujo TDD seguido

1. **Test primero**: se creó `restauracion-menu.test.ts` transcribiendo el código del brief.
2. **Falla esperada**: `npm test -- restauracion-menu` → `Failed to resolve import "@/lib/restauracion/menu". Does the file exist?` (módulo no encontrado, como se esperaba).
3. **Implementación**: se creó `menu.ts` transcribiendo el código del brief (`SelectedModifier`, `effectiveUnitPriceCents`, `ComboPiece`, `ExpandedLine`, `expandCombo`).
4. **Test en verde**: `npx vitest run src/tests/unit/restauracion-menu.test.ts` → **5/5 tests pasan** (1 test file).
   - Nota: `npm test -- restauracion-menu` (patrón parcial) matchea además otros ficheros de tareas previas del mismo plan (`restauracion-menu-base-sql.test.ts`, `restauracion-menu-indexes-sql.test.ts`), sumando 11 tests en total entre los 3 ficheros — no forman parte de esta tarea, solo coinciden por el prefijo del nombre de fichero.
5. **Typecheck**: `npm run typecheck` (`tsc --noEmit`) → **exit 0**.

## Desviación menor respecto al brief (documentada)

El repo tiene `tsconfig.json` con `"noUncheckedIndexedAccess": true`. El test verbatim del brief usa `lines[0].qty` / `lines[1].qty`, lo cual con esa flag produce error de typecheck (`TS2532: Object is possibly 'undefined'`) porque el acceso indexado a un array devuelve `T | undefined`.

Se resolvió aplicando la convención ya existente en otros tests del mismo repo (p. ej. `availability.test.ts:133`, `booking-day-grid-contract.test.tsx:282`, que usan `arr[0]!`): se añadió el operador de aserción no-nula (`!`) en esas dos líneas → `lines[0]!.qty` / `lines[1]!.qty`. La semántica del test es idéntica; solo cambia para satisfacer el modo estricto del proyecto y cumplir el requisito de `npm run typecheck` con exit 0 antes del commit.

Todo lo demás (lógica de `menu.ts`, resto del test, nombres, estructura) es transcripción exacta del brief.

## Verificación final

- `git status --short` en el repo anidado tras el commit: solo `?? .claude/` (untracked, intacto, sin tocar).
- Commit incluye exactamente los 2 ficheros nuevos (`git add` explícito de ambas rutas, sin `-A`).
- No se tocó ningún otro fichero del repo.

## Preocupaciones

Ninguna bloqueante. La única nota es la desviación documentada arriba (aserción `!` por `noUncheckedIndexedAccess`), que es cosmética y no afecta el comportamiento probado.
