# Kairos · Restauración — Plan C: KDS (pantalla de cocina en tiempo real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al sector `restauracion` una **pantalla de cocina (KDS)** en `/cocina`: muestra en tiempo real las líneas de pedido enviadas, agrupadas por estación, con cronómetro, y botones **Entregar** (→ listo) / **Entregado** (→ cierra).

**Architecture:** El KDS es una vista de LECTURA sobre `order_items` (creados en Plan B) filtrados por estado activo, agrupados por pedido/estación, refrescados por **Supabase Realtime** (patrón `useDayPanelRealtime`). Las transiciones de estado reutilizan la server action `setOrderItemStatus` (ya existe de Plan B). No hay tablas nuevas: solo se añade `order_items` a la publicación `supabase_realtime` para que el Realtime dispare.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + Realtime + RLS), React Query v5, shadcn/ui, Vitest + Testing Library.

## Global Constraints

- **RLS por salón** ya existe en `order_items` (Plan B): SELECT para cualquier miembro. El KDS es visible a **staff** (como `/mostrador`), gateado solo por sector.
- **Realtime**: `order_items` debe estar en la publicación `supabase_realtime` o el Realtime NO dispara. NO hay precedente en el repo (la tabla `appointments` se añadió a mano en el dashboard) → este plan lo hace en una **migración idempotente**.
- Reusar `setOrderItemStatus` (`src/app/(dashboard)/mostrador/actions.ts`, Plan B) para Entregar/Entregado. Es transición segura por concurrencia (`.eq("status", from)`; devuelve `CONFLICTO` si otra pantalla ya transicionó) y rechaza `to='anulado'`.
- **Migración por Management API** (no CLI): `POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/query`, `Authorization: Bearer $SUPABASE_API_TOKEN` (de `clients/projects/denueveanueve/.env`), **User-Agent de navegador**. DDL correcto → `(201, [])`.
- **Testing sin Postgres** (jsdom): lógica pura → `src/tests/unit/`; migración → "sql-coherence" (leer el `.sql` con `readFileSync`); componentes → mock de hooks `use-*` con `vi.hoisted`. `npm test` (=`vitest run`) y `npm run typecheck` verdes.
- **Repo anidado**: `clients/projects/salon-os` tiene su propio `.git` (rama `hat3x/HAT3X-038`, sin remoto). Commit SOLO los ficheros de cada tarea por **pathspec**; **NUNCA `git add -A`**; dejar `.claude/` untracked intacto.
- `noUncheckedIndexedAccess: true`: usar `!`/guardas donde el compilador lo exija.
- Determinismo en tests: `elapsedMinutes` recibe la fecha como argumento; NO `Date.now()` dentro de lógica pura.
- TDD estricto, commits frecuentes. Identificadores en inglés, copy en español.

---

## File Structure

**Migraciones (crear):** `.../supabase/migrations/20260810120000_realtime_order_items.sql` — añade `order_items` a `supabase_realtime` (idempotente).

**Lógica pura (crear):** `.../src/lib/restauracion/kds.ts` — `elapsedMinutes`, `groupKdsItemsByOrder`, tipos.

**Datos/servidor (crear):**
- `.../src/lib/queries/kds.ts` — `kdsKeys` + `fetchKdsItems`.
- `.../src/hooks/use-kds.ts` — `useKdsItems`, `useKdsRealtime`.

**UI (crear):** `.../src/app/(dashboard)/cocina/{layout.tsx,page.tsx,cocina-view.tsx,station-column.tsx,order-ticket-card.tsx}`.

**Activación (modificar):** `.../src/components/dashboard-nav-items.ts` — item `/cocina` (staff).

> Rutas abreviadas `…/` = `clients/projects/salon-os/`.

---

## Task 1: Migración — order_items a la publicación Realtime

**Files:**
- Create: `…/supabase/migrations/20260810120000_realtime_order_items.sql`
- Test: `…/src/tests/unit/realtime-order-items-sql.test.ts`

**Interfaces:**
- Consumes: `public.order_items` (Plan B), publicación `supabase_realtime`.
- Produces: `order_items` presente en `supabase_realtime` → los cambios emiten a los clientes suscritos.

- [ ] **Step 1: Write the failing sql-coherence test**

Create `…/src/tests/unit/realtime-order-items-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SQL = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260810120000_realtime_order_items.sql"),
  "utf8",
).toLowerCase();

describe("migración realtime order_items", () => {
  it("añade order_items a la publicación supabase_realtime de forma idempotente", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.order_items");
    expect(SQL).toContain("pg_publication_tables");
    expect(SQL).toContain("'order_items'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- realtime-order-items-sql`
Expected: FAIL (ENOENT).

- [ ] **Step 3: Write the migration**

Create `…/supabase/migrations/20260810120000_realtime_order_items.sql`:

```sql
-- =============================================================================
-- Kairos — Restauración · Realtime para order_items (KDS)
-- La publicación supabase_realtime debe incluir order_items o el KDS no refresca.
-- Idempotente: no falla si la tabla ya está publicada.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- realtime-order-items-sql`
Expected: PASS.

- [ ] **Step 5: Apply the migration**

Aplica por Management API (heredoc del bloque "Global Constraints"; debe imprimir `(201, [])`). Verifica (opcional) con `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='order_items'` → 1 fila.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/supabase/migrations/20260810120000_realtime_order_items.sql \
        clients/projects/salon-os/src/tests/unit/realtime-order-items-sql.test.ts
git commit -m "feat(restauracion): order_items en la publicación Realtime (KDS)"
```

---

## Task 2: Lógica pura del KDS (agrupar + cronómetro)

**Files:**
- Create: `…/src/lib/restauracion/kds.ts`
- Test: `…/src/tests/unit/restauracion-kds.test.ts`

**Interfaces:**
- Produces:
  - `interface KdsItem { id: string; orderId: string; orderNumber: number; orderLabel: string | null; stationId: string | null; stationName: string | null; productName: string; qty: number; status: string; modifiers: string[]; createdAt: string; }`
  - `interface KdsOrderGroup { orderId: string; orderNumber: number; orderLabel: string | null; createdAt: string; items: KdsItem[]; }`
  - `groupKdsItemsByOrder(items: readonly KdsItem[]): KdsOrderGroup[]` — agrupa por `orderId`, ordena los grupos por `createdAt` ascendente (más antiguo primero); dentro de cada grupo, los ítems en su orden de llegada.
  - `elapsedMinutes(createdAtIso: string, now: Date): number` — minutos enteros transcurridos (>= 0) entre `createdAt` y `now`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/restauracion-kds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { elapsedMinutes, groupKdsItemsByOrder, type KdsItem } from "@/lib/restauracion/kds";

function item(over: Partial<KdsItem>): KdsItem {
  return {
    id: "i", orderId: "o", orderNumber: 1, orderLabel: null, stationId: "s", stationName: "Cocina",
    productName: "X", qty: 1, status: "enviado", modifiers: [], createdAt: "2026-08-10T12:00:00Z", ...over,
  };
}

describe("groupKdsItemsByOrder", () => {
  it("agrupa por pedido y ordena los grupos por createdAt ascendente", () => {
    const groups = groupKdsItemsByOrder([
      item({ id: "a", orderId: "o2", orderNumber: 2, createdAt: "2026-08-10T12:05:00Z" }),
      item({ id: "b", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
      item({ id: "c", orderId: "o1", orderNumber: 1, createdAt: "2026-08-10T12:00:00Z" }),
    ]);
    expect(groups.map((g) => g.orderId)).toEqual(["o1", "o2"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("elapsedMinutes", () => {
  it("cuenta minutos enteros transcurridos, nunca negativo", () => {
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T12:07:30Z"))).toBe(7);
    expect(elapsedMinutes("2026-08-10T12:00:00Z", new Date("2026-08-10T11:59:00Z"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- restauracion-kds` → FAIL.

- [ ] **Step 3: Write the implementation**

Create `…/src/lib/restauracion/kds.ts`:

```ts
export interface KdsItem {
  id: string;
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  stationId: string | null;
  stationName: string | null;
  productName: string;
  qty: number;
  status: string;
  modifiers: string[];
  createdAt: string;
}

export interface KdsOrderGroup {
  orderId: string;
  orderNumber: number;
  orderLabel: string | null;
  createdAt: string;
  items: KdsItem[];
}

export function groupKdsItemsByOrder(items: readonly KdsItem[]): KdsOrderGroup[] {
  const byOrder = new Map<string, KdsOrderGroup>();
  for (const it of items) {
    const existing = byOrder.get(it.orderId);
    if (existing === undefined) {
      byOrder.set(it.orderId, {
        orderId: it.orderId, orderNumber: it.orderNumber, orderLabel: it.orderLabel,
        createdAt: it.createdAt, items: [it],
      });
    } else {
      existing.items.push(it);
    }
  }
  return [...byOrder.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function elapsedMinutes(createdAtIso: string, now: Date): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- restauracion-kds` → PASS.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/kds.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-kds.test.ts
git commit -m "feat(restauracion): lógica pura del KDS (agrupar por pedido + cronómetro)"
```

---

## Task 3: Queries + hooks del KDS (con Realtime)

**Files:**
- Create: `…/src/lib/queries/kds.ts`, `…/src/hooks/use-kds.ts`
- Test: `…/src/tests/unit/kds-keys.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/client`; `type KdsItem` de `@/lib/restauracion/kds`; `useQuery`/`useQueryClient`.
- Produces:
  - `kdsKeys`: `all(salonId)`, `items(salonId)`.
  - `fetchKdsItems(salonId): Promise<KdsItem[]>` — lee `order_items` con `status in ('enviado','preparando','listo')`, `void_of_item_id is null`, join `products(name)`, `stations(name)` y `orders(order_number, label, created_at)`, acotado por `salon_id`, ordenado por `created_at` ascendente; mapea a `KdsItem`.
  - `useKdsItems(salonId)`: `useQuery`.
  - `useKdsRealtime(salonId): "connecting" | "connected" | "error"` — patrón EXACTO de `src/hooks/use-day-panel-realtime.ts`: canal `kds-order-items-${salonId}`, suscripción `postgres_changes` `{ event:"*", schema:"public", table:"order_items", filter:`salon_id=eq.${salonId}` }`, en cada cambio `queryClient.invalidateQueries({ queryKey: kdsKeys.all(salonId) })`; cleanup con `removeChannel`.

- [ ] **Step 1: Write the failing test**

Create `…/src/tests/unit/kds-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { kdsKeys } from "@/lib/queries/kds";

describe("kdsKeys", () => {
  it("deriva sub-keys del salón", () => {
    expect(kdsKeys.all("s1")).toEqual(["kds", "s1"]);
    expect(kdsKeys.items("s1")).toEqual(["kds", "s1", "items"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- kds-keys` → FAIL.

- [ ] **Step 3: Write the queries** — Create `…/src/lib/queries/kds.ts`:

```ts
import { createClient } from "@/lib/supabase/client";
import type { KdsItem } from "@/lib/restauracion/kds";

export const kdsKeys = {
  all: (salonId: string) => ["kds", salonId] as const,
  items: (salonId: string) => [...kdsKeys.all(salonId), "items"] as const,
};

const ACTIVE_STATUSES = ["enviado", "preparando", "listo"] as const;

export async function fetchKdsItems(salonId: string): Promise<KdsItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, station_id, product_id, qty, status, modifiers_snapshot, created_at, " +
        "products(name), stations(name), orders(order_number, label, created_at)",
    )
    .eq("salon_id", salonId)
    .is("void_of_item_id", null)
    .in("status", ACTIVE_STATUSES as unknown as string[])
    .order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map((row): KdsItem => {
    const mods = Array.isArray(row.modifiers_snapshot)
      ? (row.modifiers_snapshot as Array<{ name?: string }>).map((m) => m.name ?? "").filter((n) => n.length > 0)
      : [];
    return {
      id: row.id, orderId: row.order_id,
      orderNumber: row.orders?.order_number ?? 0, orderLabel: row.orders?.label ?? null,
      stationId: row.station_id, stationName: row.stations?.name ?? null,
      productName: row.products?.name ?? "Producto", qty: row.qty, status: row.status,
      modifiers: mods, createdAt: row.created_at,
    };
  });
}
```

> Nota: los joins embebidos de supabase-js pueden requerir un tipo de fila auxiliar o `as` para que `npm run typecheck` quede a 0 sin `any` amplio. Usa un tipo de fila embebida explícito si hace falta.

- [ ] **Step 4: Write the hooks** — Create `…/src/hooks/use-kds.ts` (`"use client"`). `useKdsItems` = `useQuery(kdsKeys.items(salonId), () => fetchKdsItems(salonId))`. `useKdsRealtime` = copia estructural de `src/hooks/use-day-panel-realtime.ts` cambiando: nombre de canal `kds-order-items-${salonId}`, `table: "order_items"`, e invalidando `kdsKeys.all(salonId)`.

- [ ] **Step 5: Run test + typecheck.** `npm test -- kds-keys && npm run typecheck` → PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/queries/kds.ts \
        clients/projects/salon-os/src/hooks/use-kds.ts \
        clients/projects/salon-os/src/tests/unit/kds-keys.test.ts
git commit -m "feat(restauracion): queries y hooks del KDS (lectura + Realtime)"
```

---

## Task 4: UI del KDS (`/cocina`)

**Files:**
- Create: `…/src/app/(dashboard)/cocina/{layout.tsx,page.tsx,cocina-view.tsx,station-column.tsx,order-ticket-card.tsx}`
- Test: `…/src/tests/unit/order-ticket-card.test.tsx`

**Interfaces:**
- Consumes: `useKdsItems`/`useKdsRealtime` (`@/hooks/use-kds`), `useSetOrderItemStatus` (`@/hooks/use-orders`, Plan B), `groupKdsItemsByOrder`/`elapsedMinutes` (`@/lib/restauracion/kds`).
- Produces: ruta `/cocina` (sector restauración, staff — SIN gate de rol). Columnas por estación; cada pedido como tarjeta con nº de pedido, etiqueta, cronómetro, líneas (qty × nombre + modificadores) y botones **Entregar**/**Entregado** por línea.

- [ ] **Step 1: Write the failing component test** — Create `…/src/tests/unit/order-ticket-card.test.tsx`. Mockea `@/hooks/use-orders` (`useSetOrderItemStatus`) con `vi.hoisted`. Contrato de `OrderTicketCard`: dado un `KdsOrderGroup` con un ítem en estado `enviado`, renderiza el nº de pedido, el nombre del producto, y un botón `getByRole("button", {name:/entregar/i})`; al pulsarlo llama `setOrderItemStatus.mutate` con `{ itemId, from: "enviado", to: "listo" }`. Para un ítem `listo`, muestra botón `getByRole("button", {name:/entregado/i})` que llama con `{ from:"listo", to:"entregado" }`.

- [ ] **Step 2: Run to verify it fails.** `npm test -- order-ticket-card` → FAIL.

- [ ] **Step 3: Implement.**
  - `layout.tsx` = `SectorGate required="restauracion"` (SIN gate de rol — staff).
  - `page.tsx` resuelve `salonId` (patrón `products/page.tsx`) → `<CocinaView salonId={salonId} />`.
  - `cocina-view.tsx` (`"use client"`): `useKdsRealtime(salonId)` (+ indicador "En directo") + `useKdsItems(salonId)`; agrupa los ítems por `stationName` en columnas (`station-column.tsx`), y dentro de cada columna agrupa por pedido con `groupKdsItemsByOrder` → `order-ticket-card.tsx`. Refresco del cronómetro cada 30 s (un `setInterval` que fuerza re-render con `useState(now)`; el `now` NO entra en lógica pura, solo se pasa a `elapsedMinutes`).
  - `order-ticket-card.tsx`: nº de pedido grande, etiqueta, cronómetro (color según minutos: verde <5, ámbar 5-10, rojo >10), líneas con qty×nombre + modificadores, y por línea: **Entregar** (`useSetOrderItemStatus().mutate({ itemId, from: item.status, to: "listo" })`) si `status !== "listo"`, y **Entregado** (`{ from:"listo", to:"entregado" }`) si `status === "listo"`. Si `mutate` devuelve CONFLICTO, no hace falta acción extra (el Realtime refresca).
  - `station-column.tsx`: encabezado de estación + lista de tarjetas.
  - Componentes shadcn de `src/components/ui/`. Modo pantalla grande (columnas amplias).

- [ ] **Step 4: Run test + full suite + typecheck.** `npm test -- order-ticket-card && npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add "clients/projects/salon-os/src/app/(dashboard)/cocina/" \
        clients/projects/salon-os/src/tests/unit/order-ticket-card.test.tsx
git commit -m "feat(restauracion): pantalla de cocina KDS (/cocina) en tiempo real"
```

---

## Task 5: Nav item /cocina (staff)

**Files:**
- Modify: `…/src/components/dashboard-nav-items.ts`
- Test: `…/src/tests/unit/dashboard-nav-items.test.ts`

**Interfaces:**
- Produces: en la rama `sector === "restauracion"` de `buildDashboardNavItems`, `COCINA_ITEM = { href: "/cocina", label: "Cocina", icon: <lucide, p.ej. ChefHat> }` para TODOS los miembros (staff), junto a `MOSTRADOR_ITEM`; `CARTA_ITEM` sigue solo con `showSettings`.

- [ ] **Step 1: Write the failing test** — añade a `…/src/tests/unit/dashboard-nav-items.test.ts`:

```ts
it("restauración: staff ve Mostrador y Cocina, no Carta", () => {
  const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
  const hrefs = items.map((i) => i.href);
  expect(hrefs).toContain("/mostrador");
  expect(hrefs).toContain("/cocina");
  expect(hrefs).not.toContain("/carta");
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- dashboard-nav-items` → FAIL.

- [ ] **Step 3: Implement.** Importa el icono, declara `COCINA_ITEM`, y en la rama de restauración añade `COCINA_ITEM` a los `extras` que ven todos los miembros (junto a `MOSTRADOR_ITEM`):

```ts
if (sector === "restauracion") {
  const base = withSectorLabels.slice(0, 1);
  const rest = withSectorLabels.slice(1);
  const extras = showSettings
    ? [MOSTRADOR_ITEM, COCINA_ITEM, CARTA_ITEM]
    : [MOSTRADOR_ITEM, COCINA_ITEM];
  return [...base, ...extras, ...rest];
}
```

- [ ] **Step 4: Run full suite + typecheck.** `npm test && npm run typecheck` → verde + exit 0.

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/dashboard-nav-items.ts \
        clients/projects/salon-os/src/tests/unit/dashboard-nav-items.test.ts
git commit -m "feat(restauracion): item de navegación Cocina (KDS, staff)"
```

---

## Criterios de aceptación (Puerta de control Plan C)

- [ ] `npm test` y `npm run typecheck` verdes.
- [ ] Migración de publicación aplicada en `jztoyekixcziaicrnlce` (`(201, [])`); `order_items` en `pg_publication_tables`.
- [ ] Al **Mandar** un pedido desde `/mostrador`, sus líneas aparecen en `/cocina` en la columna de su estación (comida→cocina, bebida→barra) **en tiempo real** (sin recargar).
- [ ] **Entregar** una línea la marca `listo`; **Entregado** la saca de la pantalla; el cambio se refleja en cualquier otra pantalla abierta (Realtime).
- [ ] Dos pantallas marcando la misma línea: la segunda recibe CONFLICTO sin romperse (el Realtime la refresca).
- [ ] Un `staff` puede usar `/cocina` (no requiere owner/manager).

## Notas / riesgos

- El cronómetro usa `order_items.created_at` como proxy de "hora de envío" (no hay `sent_at` dedicado). Suficiente para v1; si se quiere exactitud, añadir `sent_at` en una migración futura.
- `useSetOrderItemStatus` rechaza `to='anulado'` y exige `from` correcto (Plan B) → el KDS pasa `from: item.status`; ante CONFLICTO, el Realtime refresca el estado real.
- Si el Realtime no dispara, comprobar que la Task 1 (ALTER PUBLICATION) se aplicó de verdad: es el gotcha conocido del repo.
