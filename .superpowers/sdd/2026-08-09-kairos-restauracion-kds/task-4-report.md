# Task 4 — UI del KDS (`/cocina`) — Informe

**STATUS:** DONE
**Commit:** `38b00d27264f28f768d1b41b5761cb320d00a2bd` (repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
`feat(restauracion): pantalla de cocina KDS (/cocina) en tiempo real`

## Ficheros creados

| Fichero | Rol |
|---|---|
| `src/app/(dashboard)/cocina/layout.tsx` | `SectorGate required="restauracion"`, sin gate de rol (staff) |
| `src/app/(dashboard)/cocina/page.tsx` | Server component: resuelve sesión + `salonId` (patrón `mostrador/page.tsx`) |
| `src/app/(dashboard)/cocina/cocina-view.tsx` | `"use client"`: orquesta Realtime, fetch, cronómetro y agrupación por estación |
| `src/app/(dashboard)/cocina/station-column.tsx` | Columna por estación: encabezado + lista de tarjetas |
| `src/app/(dashboard)/cocina/order-ticket-card.tsx` | Tarjeta de comanda por pedido: líneas, cronómetro, botones Entregar/Entregado |
| `src/tests/unit/order-ticket-card.test.tsx` | Test TDD del contrato de `OrderTicketCard` |

## Decisiones de UI

- **Layout/page**: copia estructural exacta de `mostrador/{layout,page}.tsx` — mismo guard de sesión (`redirect("/login")` si no hay usuario), mismo aviso in-page si el usuario no tiene salón activo. Único cambio: `CocinaView` solo necesita `salonId` (no `salonName`, el KDS no imprime tickets).
- **Columnas por estación**: `groupByStation` (local a `cocina-view.tsx`) agrupa las `KdsItem[]` por `stationName`, con sentinela `"Sin estación"` para líneas sin `stationId` en la carta (evita que desaparezcan silenciosamente). Las estaciones se ordenan alfabéticamente (`localeCompare("es")`) para un orden estable entre renders.
- **Layout de pantalla grande**: fila con `overflow-x-auto` y columnas de ancho fijo (`w-80 shrink-0` en `StationColumn`) — patrón de kitchen display real: varias columnas visibles a la vez, scroll horizontal si no caben todas, sin que el contenido se comprima.
- **Indicador "En directo"**: `LiveIndicator` en `cocina-view.tsx` es una copia estructural del `RealtimeIndicator` de `day-panel-view.tsx` (mismo punto pulsante verde + `animate-ping` en conectado, `WifiOff` en error, `Loader2` girando en conectando), con el copy renombrado a "En directo" / "Sin conexión en tiempo real" / "Conectando…" para encajar en el contexto de cocina.
- **Cronómetro por línea**: banda de color en `timerTone()` (`order-ticket-card.tsx`) — verde `<5 min` (`success`), ámbar `5–10 min` (`warning`), rojo `>10 min` (`destructive`), usando los tokens de tema ya definidos en `tailwind.config.ts` (`success`, `warning`, `destructive`).
- **Componentes shadcn reusados**: `Card`/`CardHeader`/`CardContent` para la tarjeta de comanda, `Button` (tamaño `sm`, variantes `default`/`secondary`) para Entregar/Entregado. No se creó ningún componente UI nuevo.

## Cableado de Realtime

- `CocinaView` llama a `useKdsRealtime(salonId)` (ya existente, Task previa) — se suscribe a `postgres_changes` sobre `order_items` filtrado por `salon_id` e invalida `kdsKeys.all(salonId)` en cualquier INSERT/UPDATE/DELETE; el estado de conexión (`connecting`/`connected`/`error`) alimenta `LiveIndicator`.
- `useKdsItems(salonId)` (TanStack Query) reacciona automáticamente a esa invalidación y vuelve a traer las líneas activas (`enviado`/`preparando`/`listo`).
- **Cronómetro**: `useState(() => new Date())` + `useEffect` con `setInterval(() => setNow(new Date()), 30000)` y `clearInterval` en el cleanup del efecto. `now` se pasa como prop hasta `OrderTicketCard`, que es quien llama a la función pura `elapsedMinutes(item.createdAt, now)` (de `lib/restauracion/kds.ts`) — `Date.now()` nunca se usa dentro de lógica pura, solo en el `setState` del intervalo.

## Cableado de Entregar / Entregado

En `order-ticket-card.tsx`, cada línea (`item`) del pedido decide su botón según `item.status`:
- `item.status !== "listo"` (es decir, `"enviado"` o `"preparando"`) → botón **Entregar**, que llama `useSetOrderItemStatus(salonId).mutate({ itemId: item.id, from: item.status as OrderItemStatus, to: "listo" })`.
- `item.status === "listo"` → botón **Entregado**, que llama `.mutate({ itemId: item.id, from: "listo", to: "entregado" })`.

`useSetOrderItemStatus` (hook ya existente en `src/hooks/use-orders.ts`) envuelve la server action `setOrderItemStatus` (`mostrador/actions.ts`), que condiciona el `UPDATE` por `status = from` en la propia query — la transición solo se aplica si el estado en BD sigue siendo el `from` esperado. Si otro miembro del equipo ya cambió el estado (CONFLICTO), la mutation falla silenciosamente desde el punto de vista de la UI: no se añadió `onError` porque no hace falta — `useKdsRealtime` ya invalida y refresca la lista en cuanto cambia cualquier línea, así que la tarjeta se actualiza sola (la línea desaparece de "enviado" o pasa de columna) sin ninguna acción adicional. Los botones se deshabilitan mientras `setStatus.isPending` para evitar doble-clic.

## Tests

- **`order-ticket-card.test.tsx`** (nuevo, TDD): mockea `@/hooks/use-orders` con `vi.hoisted` (mismo patrón que `order-panel.test.tsx` / `menu-item-form.test.tsx`), sin necesidad de `QueryClientProvider`.
  - Caso 1: `KdsOrderGroup` con un ítem `"enviado"` → renderiza `#42` y "Hamburguesa"; botón `getByRole("button", {name:/entregar/i})`; al pulsarlo, `setOrderItemStatus.mutate` se llama una vez con `{ itemId: "item-1", from: "enviado", to: "listo" }` (verificado con `mock.calls[0]![0]` + `toMatchObject`).
  - Caso 2: mismo ítem en `"listo"` → botón `getByRole("button", {name:/entregado/i})`; al pulsarlo, `.mutate` se llama con `{ from: "listo", to: "entregado" }`.
  - Verificado en rojo antes de implementar (`Failed to resolve import ".../cocina/order-ticket-card"`), y en verde tras implementar.
- **`npm test -- order-ticket-card`**: 1 archivo, 2 tests, verde.
- **`npm test` (suite completa)**: 146 archivos, 1872 tests, todos verdes.
- **`npm run typecheck`**: exit 0.

## Desviación deliberada respecto al brief literal

El brief describe `OrderTicketCard` con props `{ group: KdsOrderGroup; now: Date }` y `useSetOrderItemStatus()` sin argumentos. La firma real del hook (ya existente, `src/hooks/use-orders.ts`) es `useSetOrderItemStatus(salonId: string)` — igual que el resto de hooks de pedidos (`useOpenOrders`, `useCreateOrder`, etc.), todos scoped por salón para invalidar correctamente las queries. Añadí `salonId: string` como prop de `OrderTicketCard` (propagada desde `CocinaView` → `StationColumn` → `OrderTicketCard`) para poder llamar al hook con la firma real; el test lo pasa explícitamente (`salonId: "SALON"`) y no verifica la forma exacta de las props, así que no rompe el contrato pedido. Sin este ajuste no compilaría (`npm run typecheck` fallaría), lo cual tenía prioridad 2 en el orden de desambiguación del brief.

## Preocupaciones / seguimiento

- No hay manejo visible de error de mutation en la UI (p. ej. toast en CONFLICTO) — se decidió así explícitamente por el brief ("no hace falta acción extra"), pero si en producción se observa que los CONFLICTOs son frecuentes (dos cocineros pulsando la misma línea a la vez) podría valer la pena un feedback visual sutil (p. ej. parpadeo breve) en vez de silencio total.
- `UNASSIGNED_STATION` ("Sin estación") es una red de seguridad para productos sin `station_id` en la carta; no debería aparecer en un salón bien configurado, pero evita que esas líneas se pierdan silenciosamente de la vista de cocina.
- No se añadió paginación ni límite de comandas por columna — a volumen alto (decenas de pedidos simultáneos abiertos) podría valer la pena revisitar el rendimiento de renderizado, pero está fuera del alcance de esta tarea.

---

## Ronda de fix (2026-08-10)

**STATUS:** DONE
**Commit:** `4958acb4ae8d866106c49a8a4d6edc25fbb1b1dc` (repo anidado `clients/projects/salon-os`, rama `hat3x/HAT3X-038`)
`fix(restauracion): KDS refresca al instante + groupByStation puro + tipar status`

Ronda pedida por el coordinador: 2 Important + 1 Minor barato. Los otros Minors señalados (LiveIndicator duplicado con `day-panel-view.tsx`, `useMemo`) quedan explícitamente diferidos, sin tocar.

### 1. (Important) Refresco instantáneo del KDS al Entregar/Entregado

`useSetOrderItemStatus` (Plan B, `src/hooks/use-orders.ts`) invalida `orderKeys`, no `kdsKeys` — no tiene forma de saber que la pantalla de cocina existe. Antes del fix, la tarjeta solo se refrescaba vía el roundtrip de `useKdsRealtime` (Supabase Realtime → invalidación → refetch), lo que deja una ventana de datos obsoletos si el canal está reconectando.

En `order-ticket-card.tsx`:
- Añadido `useQueryClient()` (de `@tanstack/react-query`) y `kdsKeys` (de `@/lib/queries/kds`).
- `advance()` ahora llama `setStatus.mutate({ itemId, from: item.status, to }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: kdsKeys.all(salonId) }) })` — el **primer** argumento (el payload) no cambió, solo se añadió un **segundo** argumento de opciones.
- Realtime queda como respaldo: si el evento Realtime llega igualmente después de la invalidación directa, es idempotente (vuelve a invalidar la misma query, sin efecto visible).

**Efecto colateral en el test:** al pasar de mock-completo-del-hook a que el componente llame directamente a `useQueryClient()` (real, no mockeado), el test original reventaba con `"No QueryClient set, use QueryClientProvider to set one"` — no hay ningún `<QueryClientProvider>` en el árbol de test. Se resolvió mockeando también `@tanstack/react-query` (`vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => m.queryClient }))`), mismo patrón `vi.hoisted` que ya se usaba para `@/hooks/use-orders` — coherente con que en TODA la suite (146 archivos) no hay un solo test que use un `QueryClientProvider` real; todos mockean el hook que lo necesita.
- Verificado explícitamente que el **primer** argumento de `mutate` sigue siendo `{itemId, from, to}` (la aserción original con `mock.calls[0]![0]` sigue intacta, sin tocar).
- Añadida una aserción nueva por test: se captura `mock.calls[0]![1]` (las opciones), se invoca manualmente `options.onSuccess()` (como haría react-query real al resolver la mutation) y se comprueba `queryClient.invalidateQueries` llamado con `{ queryKey: kdsKeys.all("SALON") }` — prueba end-to-end del wiring del fix, no solo que compile.

### 2. (Important) `groupByStation` subido a lógica pura

Movido de función local en `cocina-view.tsx` a export puro en `src/lib/restauracion/kds.ts`:

```ts
export const UNASSIGNED_STATION = "Sin estación";
export interface KdsStationGroup { stationName: string; items: KdsItem[] }
export function groupKdsItemsByStation(items: readonly KdsItem[]): KdsStationGroup[]
```

Conserva el comportamiento exacto de antes (sentinela `"Sin estación"` cuando `stationName === null`, orden alfabético `localeCompare("es")` de las estaciones) pero ahora es testable sin montar componentes. `cocina-view.tsx` importa `groupKdsItemsByStation` y elimina la función local + el `UNASSIGNED_STATION` duplicado + el `Map` manual; el `.map()` de render pasa a iterar directamente `stationGroups` (`{ stationName, items }[]`) en vez de `stationNames` + `byStation.get(...)`.

Test nuevo en `src/tests/unit/restauracion-kds.test.ts` (`describe("groupKdsItemsByStation")`, mismo `item()` helper que ya usaba el archivo para `groupKdsItemsByOrder`/`elapsedMinutes`):
- Agrupa por `stationName` y ordena los grupos alfabéticamente (caso "Barra"/"Cocina").
- Ítems con `stationName: null` caen en `"Sin estación"`.

### 3. (Minor) Tipar `KdsItem.status`

`src/lib/restauracion/kds.ts`: `status: string` → `status: OrderItemStatus` (import `type { OrderItemStatus } from "@/types/database"`). En `order-ticket-card.tsx` se eliminó el cast `item.status as OrderItemStatus` en `advance()` (ya no hace falta, `item.status` es `OrderItemStatus` de forma nativa). Verificado:
- `fetchKdsItems` (`src/lib/queries/kds.ts`, Task 3) sigue tipando bien sin cambios — `row.status` ya era `OrderItemStatus` en `KdsItemRow`, y se asigna directo a `status: row.status` en el `KdsItem` devuelto.
- El test de Task 2 (`restauracion-kds.test.ts`, `item()` con `status: "enviado"` como default) sigue compilando: el literal `"enviado"` es un miembro válido de `OrderItemStatus`, TypeScript lo infiere sin fricción.

### Tests y typecheck (ronda de fix)

- `npm test -- order-ticket-card restauracion-kds` → 2 archivos, 6 tests, verde.
- `npm test` completo → 146 archivos, **1874 tests** (2 más que en la entrega anterior, por los dos casos nuevos de `groupKdsItemsByStation`), todos verdes.
- `npm run typecheck` → exit 0.

### Desviación de pathspec

El coordinador listó 4 ficheros a commitear (`cocina/order-ticket-card.tsx`, `cocina/cocina-view.tsx`, `lib/restauracion/kds.ts`, `src/tests/unit/restauracion-kds.test.ts`). Se incluyó un 5º fichero necesario: `src/tests/unit/order-ticket-card.test.tsx`, porque el propio fix #1 rompía ese test (ver arriba, "Efecto colateral en el test") y dejarlo fuera del commit habría dejado la suite en rojo. Sigue siendo commit por pathspec explícito, ningún `git add -A`; `.claude/` permanece untracked.
