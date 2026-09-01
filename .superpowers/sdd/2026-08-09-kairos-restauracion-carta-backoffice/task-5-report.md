# Task 5 — Informe: Capa de queries + hooks de carta

## STATUS: DONE

## Resumen

Implementada la capa de lectura (queries + hooks) de la carta del backoffice de restauración en Kairos (`clients/projects/salon-os`), siguiendo TDD según el brief `task-5-brief.md`, transcribiendo el código verbatim.

## Ficheros creados

1. `clients/projects/salon-os/src/tests/unit/menu-keys.test.ts` — test de `menuKeys` (keys estables por salón).
2. `clients/projects/salon-os/src/lib/queries/menu.ts` — `menuKeys` (fábrica de keys estilo `productKeys`: `all`, `categories`, `stations`, `products`, `modifierGroups`) + fetchers `fetchMenuCategories`, `fetchStations`, `fetchMenuProducts` (usan `createClient()` de `@/lib/supabase/client`, tablas `menu_categories`/`stations`/`products` filtradas por `salon_id`, ordenadas por `sort_order`/`name`).
3. `clients/projects/salon-os/src/hooks/use-menu.ts` — hooks de lectura `useMenuCategories(salonId)`, `useStations(salonId)`, `useMenuProducts(salonId)` sobre `useQuery` de TanStack Query, con las keys de `menuKeys`.

Ningún otro fichero fue modificado. No se tocaron hooks de mutación (fuera de alcance, Task 6).

## Proceso TDD seguido

1. Escrito `menu-keys.test.ts` (verbatim del brief).
2. `npm test -- menu-keys` → FAIL confirmado: `Failed to resolve import "@/lib/queries/menu"` (módulo no encontrado), como se esperaba.
3. Creado `src/lib/queries/menu.ts` (verbatim del brief).
4. Creado `src/hooks/use-menu.ts` (verbatim del brief).
5. `npm test -- menu-keys` → PASS (1 test file, 1 test).
6. `npm run typecheck` (`tsc --noEmit`) → exit 0, sin errores. No hizo falta usar `!` para `noUncheckedIndexedAccess` — el código no tiene accesos indexados problemáticos.
7. Commit con exactamente los 3 ficheros nuevos (`git add` explícito, sin `-A`), `.claude/` quedó untracked intacto.

## Verificación de contexto previo

- Confirmado que `MenuCategory` (línea 3716), `Station` (línea 3717) y `Product` (línea 3619) ya existen en `src/types/database.ts` (tareas previas).
- Confirmado que `createClient` de `@/lib/supabase/client` es el cliente de navegador ya usado en `src/lib/queries/products.ts` (mismo patrón replicado).
- Confirmado que no existían previamente `src/lib/queries/menu.ts`, `src/hooks/use-menu.ts` ni `src/tests/unit/menu-keys.test.ts` (Glob antes de crear).
- Repo anidado: comandos `npm` y `git` ejecutados con cwd en `clients/projects/salon-os` (su propio `.git`), rama `hat3x/HAT3X-038` (ya activa, sin cambios de rama necesarios).

## Commit

- Hash: `28eef16f879d9cf6aebec2cf528252e9e2cd997e`
- Mensaje: `feat(restauracion): queries y hooks de lectura de carta`
- 3 files changed, 60 insertions(+)

## Tests

- `npm test -- menu-keys`: 1 test file passed, 1 test passed (`menuKeys deriva las sub-keys del salón`).
- `npm run typecheck`: exit 0, sin errores.

## Preocupaciones / notas

- Ninguna. El código es transcripción literal del brief; no hubo desviaciones ni necesidad de anotaciones `!` por `noUncheckedIndexedAccess`.
- Nota de proceso: el repositorio tiene un hook "Fact-Forcing Gate" que exige justificar cada creación de fichero nuevo (caller, no-duplicado, estructura de datos, instrucción verbatim) antes de permitir el `Write`. Se satisfizo en los 3 casos; no afecta al contenido entregado, solo añadió pasos de justificación durante la ejecución.
- Los hooks de mutación (crear/editar/eliminar categorías, productos, stations, modifier groups) quedan pendientes de la Task 6, tal como delimita el brief.
