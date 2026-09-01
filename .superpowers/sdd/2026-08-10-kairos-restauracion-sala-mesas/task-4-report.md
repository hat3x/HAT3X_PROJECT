# Task 4 — Report

## STATUS: DONE

## Files created

- `clients/projects/salon-os/src/lib/queries/tables.ts` — `tableKeys` factory (`all`/`zones`/`tables`/`openOrders`) + `fetchZones`/`fetchTables`/`fetchTableOrders`, patrón idéntico a `queries/orders.ts` (`select("*")`, `.eq("salon_id", salonId)`, `if (error !== null) throw new Error(error.message)`).
  - `fetchZones`: `dining_zones`, `active=true`, `order by sort_order asc`.
  - `fetchTables`: `dining_tables`, `active=true`, `order by sort_order asc`.
  - `fetchTableOrders`: `orders`, `status='abierta'`, `.not("dining_table_id", "is", null)`, `order by created_at asc`.
- `clients/projects/salon-os/src/hooks/use-tables.ts` — `"use client"`; `useZones`/`useTables`/`useTableOrders` (useQuery sobre las queries anteriores) + `useTablesRealtime(salonId)` copiando la estructura de `use-day-panel-realtime.ts`: canal `sala-${salonId}`, dos suscripciones `postgres_changes` (`dining_tables` y `orders`, ambas `filter: salon_id=eq.${salonId}`), ambas invalidan `tableKeys.all(salonId)`, cleanup con `removeChannel` en el `useEffect`.
- `clients/projects/salon-os/src/tests/unit/table-keys.test.ts` — test del brief, sin modificaciones.

## Commit

- `24bc11d` — `feat(restauracion): queries y hooks de sala (lectura + Realtime)` (rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`). Staged por pathspec exacto (los 3 ficheros); `git status` confirmado limpio salvo `.claude/` (untracked, no tocado).

## Tests

`npm test -- table-keys` → 1 test file, 1 test, PASS. `npm run typecheck` (`tsc --noEmit`) → exit 0, sin salida de errores.

## Dudas

Ninguna. Mutaciones de mesas (mover, cambiar estado, etc.) quedan para Task 5 según el brief.
