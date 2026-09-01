# Task 3 — Report: Queries + hooks de pedidos

**STATUS: DONE**

## Commit

- Repo: `clients/projects/salon-os` (repo anidado, rama `hat3x/HAT3X-038`)
- Hash: `a9c110d3cf380cedb3b16df1834fa8bc8d3b8aad`
- Mensaje: `feat(restauracion): queries y hooks de pedidos`
- Archivos: `src/hooks/use-orders.ts` (+14), `src/lib/queries/orders.ts` (+28), `src/tests/unit/order-keys.test.ts` (+10) — 3 files changed, 52 insertions(+), 0 deletions.
- `.claude/` permaneció untracked (no se usó `git add -A`).

## Flujo TDD seguido

1. **Fichero de test creado primero** (`src/tests/unit/order-keys.test.ts`), transcrito verbatim del brief.
2. **Confirmado el fallo esperado**: `npm test -- order-keys` → `Failed to resolve import "@/lib/queries/orders"` (módulo no encontrado). Comportamiento correcto para TDD red.
3. **Creado `src/lib/queries/orders.ts`** verbatim del brief: `orderKeys` (`all`/`open`/`detail`), `fetchOpenOrders(salonId)`, `fetchOrderItems(salonId, orderId)`.
4. **Creado `src/hooks/use-orders.ts`** verbatim del brief: `useOpenOrders(salonId)`, `useOrderItems(salonId, orderId | null)` sobre `@tanstack/react-query`.
5. **Verificación final**: `npm test -- order-keys` → 1 test file passed, 1 test passed. `npm run typecheck` (`tsc --noEmit`) → exit 0, sin salida.
6. **Commit** con exactamente los 3 ficheros (`git add` explícito por nombre, no `-A`).

## Resumen de tests

- `order-keys.test.ts`: 1/1 passed (verifica `orderKeys.all/open/detail`).
- `npm run typecheck`: exit 0, cero errores.
- No se tocó ningún otro test existente ni fichero fuera del alcance de la task.

## Contexto verificado antes de escribir

- Tipos `Order`/`OrderItem` ya existían en `src/types/database.ts` (líneas 3926-3929, Task 1 completada previamente: `Order = Tables<"orders">`, `OrderItem = Tables<"order_items">`).
- `createClient` de `@/lib/supabase/client` ya existía (cliente de navegador con `createBrowserClient<Database>`).
- Directorios `src/lib/queries/` y `src/hooks/` ya existían con convención idéntica establecida por la task previa de "carta" (`src/lib/queries/menu.ts` + `src/hooks/use-menu.ts`, commit `28eef16`), lo que confirma que el patrón `*Keys`/`fetch*`/`use*` transcrito del brief es consistente con el resto del proyecto.
- Ningún fichero con el mismo nombre existía antes (`orders.ts`, `use-orders.ts`, `order-keys.test.ts` confirmados `MISSING` vía Glob/Bash antes de escribir).

## Preocupaciones

Ninguna. Task acotada a lectura (queries + hooks `useQuery`); no se tocaron mutaciones, server actions, ni UI — como indica el alcance de la task. El gate "Fact-Forcing" se satisfizo en cada uno de los 3 `Write` de fichero nuevo con evidencia real (Glob/Bash previos), no con justificaciones genéricas.
