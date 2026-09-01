# Task 2 — Informe: lógica pura de pedido (drafts de ítems + líneas de cobro)

## STATUS: DONE

## Resumen

Implementada la capa pura de pedido de mostrador (Plan B, sector restauración) siguiendo TDD según el brief: test → falla (módulo no encontrado) → implementación → test verde → typecheck → commit. Sin BD, sin migraciones.

## Ficheros

- `clients/projects/salon-os/src/lib/restauracion/order.ts` (nuevo)
- `clients/projects/salon-os/src/tests/unit/restauracion-order.test.ts` (nuevo)

## Pasos ejecutados

1. **Test (Step 1)**: creado `restauracion-order.test.ts` verbatim del brief.
2. **Confirmación de fallo (Step 2)**: `npm test -- restauracion-order` → `Failed to resolve import "@/lib/restauracion/order"` (módulo no encontrado), como se esperaba.
3. **Implementación (Step 3)**: creado `order.ts` verbatim del brief — `buildOrderItemDrafts`, `buildSettleLines`, `settleTotals` sobre `effectiveUnitPriceCents`/`expandCombo`/`ComboPiece` (`@/lib/restauracion/menu`, Plan A) y `computeSaleTotals`/`SaleTotals` (`@/lib/payments`).
4. **Test verde (Step 4)**: `npm test -- restauracion-order` → 3/3 tests PASS a la primera (sin desviaciones respecto al brief).
5. **Typecheck**: `tsc --noEmit` marcó 6 errores `TS2532` (`noUncheckedIndexedAccess`) sobre accesos indexados del test (`drafts[0]`, `drafts[1]`, `drafts[2]`, `lines[0]`) — anticipado en las restricciones de la tarea. Corregido añadiendo `!` (convención del repo) en esos 6 accesos. Re-ejecutado typecheck → **exit 0**; re-ejecutado test → sigue 3/3 PASS.
6. **Commit (Step 5 del brief)**: `git add` solo los 2 ficheros por pathspec (nunca `-A`), commit con el mensaje exacto del brief, desde el repo anidado `clients/projects/salon-os` (rama `hat3x/HAT3X-038`).

## Desviación del brief

Ninguna en el código (transcripción verbatim de `order.ts` y del test). Única adición: 6 `!` de non-null assertion en el test, previstos explícitamente por el propio brief ("si algún acceso indexado... da TS2532, usa `!`").

## Resultado de tests

- `npm test -- restauracion-order` → **3/3 tests PASS**.
- `npm test -- restauracion` (suite completa restauración, Plan A + Plan B) → **9 ficheros / 39 tests PASS**, sin regresiones sobre el baseline de Task 1 (8 ficheros / 36 tests).

## Typecheck

`npm run typecheck` (`tsc --noEmit`) → **exit 0**.

## Commit

```
80d3874 feat(restauracion): lógica pura de pedido (drafts de ítems + líneas de cobro)
 2 files changed, 122 insertions(+)
 create mode 100644 src/lib/restauracion/order.ts
 create mode 100644 src/tests/unit/restauracion-order.test.ts
```
Hash completo: `80d3874488876fad9e08ab53d63167249f4b0d22`
(repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`, sin remoto — commit local únicamente)

## Preocupaciones

- Sin preocupaciones funcionales: transcripción verbatim del brief, sin BD/migraciones, sin dependencias nuevas.
- `.claude/` sigue untracked en el repo anidado (no tocado, según instrucción).
- No se ejecutó la suite completa del proyecto (`npm test` sin filtro) — solo el filtro `restauracion`, ya que la tarea es una adición aislada de lógica pura sin tocar ficheros existentes; el filtro cubre el módulo afectado y sus vecinos de Plan A/B.
