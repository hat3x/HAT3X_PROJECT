# Kiosko de tienda autoservicio (Salón OS) — Plan de implementación · Fase Web MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar el kiosko web de autoservicio de tienda dentro de Salón OS —catálogo, carrito, fidelidad opcional, pago (con pasarela simulada) y pantalla de pedidos del personal— funcionando de extremo a extremo en el navegador y probado.

**Architecture:** Ruta nueva sin login `(/kiosko)` en la app Next de Salón OS, autorizada por una **clave de dispositivo** (`service_api_keys`, scope `kiosk:sale`) guardada en cookie HttpOnly. Las escrituras las hacen **Server Actions con el cliente admin (service_role)** —mismo patrón que `createSale`—, gateadas por esa clave y por el feature `kiosk`; el cargo de tarjeta vive tras una interfaz cliente `PaymentBridge` (impl. `MockPaymentBridge` en esta fase). Reutiliza `pos_sales/lines/payments`, `@/lib/payments`, VeriFactu y loyalty.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Supabase (`@supabase/ssr`, service_role admin) · Zod · TanStack Query v5 · Tailwind + shadcn/ui · Vitest + Testing Library · `next/font` (Playfair Display + Inter).

**Alcance de este plan:** Fase Web MVP (fases 1–3 + gating/branding + alta piloto del spec). **La carcasa Capacitor + SumUp real es un plan aparte** (Plan 2, dependiente de hardware): esta fase deja el kiosko completo y probable con `MockPaymentBridge`.

**Spec:** `docs/superpowers/specs/2026-07-31-kiosko-tienda-autoservicio-salon-os-design.md`
**Mockup visual aprobado (fuente de verdad del diseño):** `docs/superpowers/specs/assets/2026-07-31-kiosko-liquid-glass-perla.html`

## Global Constraints

- **CWD de todos los comandos:** `clients/projects/salon-os/`. Tests: `npm test` (= `vitest run`). Un solo test: `npm test -- src/tests/ruta.test.ts`. Typecheck: `npm run typecheck`.
- **Dinero:** enteros de céntimos (`*_cents`). Precios = BRUTO (IVA incluido). Totales SIEMPRE vía `@/lib/payments` (`computeSaleTotals`/`computeLineTotals`) — nunca se confía en totales del cliente.
- **Multi-tenant:** todo lleva `salon_id`. Las escrituras del kiosko usan el **cliente admin** (`@/lib/supabase/admin`, service_role) y acotan `salon_id` A MANO al salón resuelto por la clave de dispositivo. Nunca se expone `SUPABASE_SERVICE_ROLE_KEY` al cliente.
- **Migraciones:** en `supabase/migrations/`, nombre `YYYYMMDDHHMMSS_<slug>.sql`, con guardián `do $$ … $$` autoverificable (patrón de la casa: ver `20260722100000_service_api_keys.sql`). Proyecto sin datos de producción → aditivas, sin backfill (salvo alta de features).
- **Tests de Server Actions:** patrón "doble de Supabase" con `vi.mock("@/lib/supabase/admin")` / `"@/lib/supabase/server")` (ver `src/tests/integration/tpv-create-sale-loyalty.test.ts`). NO hay harness de BD real automatizado: las migraciones SQL se verifican con su guardián + una comprobación manual documentada.
- **Estética (del mockup aprobado):** acabado **Perla** (`--accent:#a85462`, `--bg:#ece5e9`), estilo **Liquid Glass**, tipografía **Playfair Display + Inter** vía `next/font` (self-hosted, NO CDN). Composición escaparate (nav + héroe + galería + carrito). **Cajas de foto de altura fija** con `object-fit:cover`; título/precio SIEMPRE debajo. Respetar `prefers-reduced-motion`. Color/logo por salón vía `salon_branding`.
- **Refinamiento sobre el spec:** el spec §3/§7 nombraba RPCs `kiosk_create_order`/`kiosk_get_catalog`; se implementan como **Server Actions TS con el cliente admin** (consistente con `createSale`, mejor testeabilidad, mismo resultado de seguridad: servidor, gateado, totales desde el catálogo del servidor). La única lógica en SQL es el esquema + una función determinista de código de recogida.

---

## File Structure

**Migraciones (SQL):**
- `supabase/migrations/<ts>_kiosk_base.sql` — enums `pos_sale_channel`/`pos_fulfillment_status`, columnas en `pos_sales`, función `app.next_kiosk_pickup_code`, valor `kiosk` del enum de features + guardián.
- `supabase/migrations/<ts>_product_images.sql` — `products.image_url` + bucket Storage `product-images` + policies.

**Dominio / servidor (TS):**
- `src/lib/kiosk/guard.ts` — `resolveKioskContext(headers/cookies)` (verifica clave de dispositivo + feature `kiosk` → `{ salonId, scopes }`).
- `src/lib/kiosk/pickup-code.ts` — helper puro de formato del código de recogida.
- `src/lib/kiosk/catalog.ts` — `getKioskCatalog(admin, salonId)` (proyección segura del catálogo).
- `src/lib/validations/kiosk-order.ts` — Zod del payload del pedido de kiosko.
- `src/app/(kiosk)/kiosko/actions.ts` — Server Actions `fetchKioskCatalog`, `createKioskOrder`.
- `src/app/kiosko/activar/route.ts` — Route Handler: `?key=` → cookie HttpOnly → redirect.

**Cliente (TS/React):**
- `src/lib/kiosk/payment-bridge.ts` — interfaz `PaymentBridge` + `MockPaymentBridge` + `getPaymentBridge()`.
- `src/app/(kiosk)/layout.tsx` — layout del kiosko (fuentes, sin chrome de dashboard).
- `src/app/(kiosk)/kiosko/page.tsx` — server component: gate por feature (404) + carga catálogo/branding.
- `src/app/(kiosk)/kiosko/kiosk-view.tsx` + componentes (`nav`, `hero`, `product-card`, `cart-bar`, `loyalty-step`, `pay-flow`, `confirmation`).
- `src/app/(kiosk)/kiosko/kiosk.module.css` (o Tailwind) — tokens Liquid Glass Perla portados del mockup.

**Personal (dashboard):**
- `src/app/(dashboard)/kiosko/page.tsx` + `orders-view.tsx` — pantalla de pedidos (Realtime).
- `src/app/(dashboard)/kiosko/actions.ts` — `markKioskOrderDelivered`.
- Modificar `src/components/dashboard-nav-items.ts` — ítem "Kiosko" gateado por feature.

**Producto (imagen):**
- Modificar `src/lib/validations/product.ts`, `src/app/(dashboard)/products/product-form.tsx`, `.../actions.ts` — campo imagen.

**Alta piloto:**
- `scripts/enable-kiosk.ts` — activa feature `kiosk` + emite clave de dispositivo para un salón.

---

## Task 1: Migración — esquema del kiosko

**Files:**
- Create: `supabase/migrations/<ts>_kiosk_base.sql`
- Modify (regenerar): `src/types/database.ts`

**Interfaces:**
- Produces (SQL): enum `public.pos_sale_channel('staff','kiosk')`; enum `public.pos_fulfillment_status('pending','delivered')`; columnas `pos_sales.channel`, `pos_sales.fulfillment_status`, `pos_sales.idempotency_key`, `pos_sales.pickup_code`; función `app.next_kiosk_pickup_code(p_salon_id uuid) returns text`; nuevo valor `'kiosk'` en el enum de features (verificar el nombre real del tipo en `20260718100000_salon_features.sql`; el enum TS es `SalonFeature`).

- [ ] **Step 1: Escribir la migración con guardián**

```sql
-- <ts>_kiosk_base.sql
begin;

create type public.pos_sale_channel as enum ('staff', 'kiosk');
create type public.pos_fulfillment_status as enum ('pending', 'delivered');

alter table public.pos_sales
  add column channel public.pos_sale_channel not null default 'staff',
  add column fulfillment_status public.pos_fulfillment_status,      -- null = no aplica (solo kiosko)
  add column idempotency_key text,
  add column pickup_code text;

-- Idempotencia por salón: un mismo intento de checkout crea la venta una sola vez.
create unique index uq_pos_sales_idempotency
  on public.pos_sales (salon_id, idempotency_key)
  where idempotency_key is not null;

-- Pantalla del personal: pedidos de kiosko pendientes (cobro o entrega).
create index idx_pos_sales_kiosk_pending
  on public.pos_sales (salon_id, sold_at desc)
  where channel = 'kiosk' and fulfillment_status = 'pending';

-- Código de recogida: secuencia diaria por salón ("13"). Deriva de las ventas
-- de kiosko del día del salón + 1. SECURITY DEFINER, search_path='' (patrón casa).
create or replace function app.next_kiosk_pickup_code(p_salon_id uuid)
returns text language plpgsql security definer set search_path = '' as $fn$
declare v_n int;
begin
  select coalesce(count(*), 0) + 1 into v_n
  from public.pos_sales
  where salon_id = p_salon_id and channel = 'kiosk'
    and sold_at >= date_trunc('day', now());
  return v_n::text;
end;
$fn$;

-- Guardián autoverificable.
do $guard$
begin
  if not exists (select 1 from pg_type where typname = 'pos_sale_channel') then
    raise exception 'GUARDIÁN KIOSKO: falta enum pos_sale_channel';
  end if;
  perform 1 from information_schema.columns
    where table_schema='public' and table_name='pos_sales' and column_name='channel';
  if not found then raise exception 'GUARDIÁN KIOSKO: falta pos_sales.channel'; end if;
  perform 1 from information_schema.columns
    where table_schema='public' and table_name='pos_sales' and column_name='idempotency_key';
  if not found then raise exception 'GUARDIÁN KIOSKO: falta pos_sales.idempotency_key'; end if;
end;
$guard$;

commit;

-- El valor de enum de feature va en SU PROPIA migración (ver Step 1b): en Postgres
-- `alter type ... add value` no puede usarse en la misma transacción que lo usa.
```

- [ ] **Step 1b: Migración separada del valor de feature** — `<ts+1>_kiosk_feature_value.sql` (sin `begin/commit`):

```sql
-- Verificar el nombre EXACTO del enum en 20260718100000_salon_features.sql (aquí se
-- asume public.salon_feature). Debe ir en su propia migración, fuera de transacción.
alter type public.salon_feature add value if not exists 'kiosk';
```

- [ ] **Step 2: Aplicar las migraciones**

Run (con las credenciales de `.env.local`): aplicar los `.sql` vía el flujo de migraciones del repo (`supabase db push` o el que use el proyecto).
Expected: sin error; el guardián no lanza.

- [ ] **Step 3: Regenerar tipos**

Regenerar `src/types/database.ts` (mismo procedimiento que usa el repo). Verificar que `Tables<'pos_sales'>` incluye `channel`, `fulfillment_status`, `idempotency_key`, `pickup_code` y que `SalonFeature` incluye `'kiosk'`.

- [ ] **Step 4: Typecheck** — Run: `npm run typecheck` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(kiosk): esquema pos_sales (channel/fulfillment/idempotency/pickup) + feature kiosk"
```

---

## Task 2: Migración — imagen de producto

**Files:**
- Create: `supabase/migrations/<ts>_product_images.sql`
- Modify (regenerar): `src/types/database.ts`

**Interfaces:**
- Produces: columna `products.image_url text` (URL pública o path del bucket); bucket Storage `product-images` con lectura pública y escritura por miembros del salón (mirar `20260718130000_storage_salon_logos.sql` para el patrón EXACTO de policies).

- [ ] **Step 1: Escribir la migración** (portar el patrón de `storage_salon_logos`)

```sql
begin;
alter table public.products add column image_url text;
comment on column public.products.image_url is
  'URL/path de la foto del producto (bucket product-images). Usada por el kiosko y el TPV.';
-- Bucket + policies: COPIAR la estructura de 20260718130000_storage_salon_logos.sql
-- (insert en storage.buckets con public=true; policies de insert/update/delete
--  acotadas a miembros del salón por prefijo de path salon_id/...).
commit;
```

- [ ] **Step 2: Aplicar + regenerar tipos + typecheck** (igual que Task 1 steps 2–4). `Tables<'products'>` debe incluir `image_url`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat(products): columna image_url + bucket product-images"
```

---

## Task 3: Guard de dispositivo del kiosko

**Files:**
- Create: `src/lib/kiosk/guard.ts`
- Test: `src/tests/unit/kiosk-guard.test.ts`

**Interfaces:**
- Consumes: `requireServiceApiKey(headers,{admin,now})` de `@/lib/service-keys/verify` (devuelve `ServiceApiKeyIdentity` con `salonId`, `scopes`); `salonHasFeature(admin, salonId, feature)` de `@/lib/salon-features`; `createAdminClient` de `@/lib/supabase/admin`.
- Produces: `resolveKioskContext(headers: Headers, deps?): Promise<{ salonId: string; scopes: string[] }>`; constante `KIOSK_FEATURE: SalonFeature = "kiosk"`; scope requerido `KIOSK_SCOPE = "kiosk:sale"`. Lanza `Error("UNAUTHORIZED")` sin clave/scope, `Error("FEATURE_NOT_ENABLED")` sin feature.

- [ ] **Step 1: Test que falla** (mock de `verify`/`salon-features`, patrón de `reception`)

```ts
// src/tests/unit/kiosk-guard.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/service-keys/verify", () => ({ requireServiceApiKey: vi.fn() }));
vi.mock("@/lib/salon-features", () => ({ salonHasFeature: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { requireServiceApiKey } from "@/lib/service-keys/verify";
import { salonHasFeature } from "@/lib/salon-features";
import { resolveKioskContext } from "@/lib/kiosk/guard";

const H = new Headers({ "x-api-key": "sk_kiosk_x" });

it("resuelve salonId cuando clave válida con scope kiosk:sale y feature activa", async () => {
  vi.mocked(requireServiceApiKey).mockResolvedValue({ salonId: "s1", scopes: ["kiosk:sale"], keyId: "k", keyPrefix: "sk_kiosk_x" } as never);
  vi.mocked(salonHasFeature).mockResolvedValue(true);
  await expect(resolveKioskContext(H)).resolves.toEqual({ salonId: "s1", scopes: ["kiosk:sale"] });
});

it("lanza UNAUTHORIZED si falta el scope kiosk:sale", async () => {
  vi.mocked(requireServiceApiKey).mockResolvedValue({ salonId: "s1", scopes: [], keyId: "k", keyPrefix: "p" } as never);
  vi.mocked(salonHasFeature).mockResolvedValue(true);
  await expect(resolveKioskContext(H)).rejects.toThrow("UNAUTHORIZED");
});

it("lanza FEATURE_NOT_ENABLED si el salón no tiene el add-on kiosk", async () => {
  vi.mocked(requireServiceApiKey).mockResolvedValue({ salonId: "s1", scopes: ["kiosk:sale"], keyId: "k", keyPrefix: "p" } as never);
  vi.mocked(salonHasFeature).mockResolvedValue(false);
  await expect(resolveKioskContext(H)).rejects.toThrow("FEATURE_NOT_ENABLED");
});
```

- [ ] **Step 2: Run → falla** — `npm test -- src/tests/unit/kiosk-guard.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** `src/lib/kiosk/guard.ts` (espejo reducido de `resolveReceptionContext`)

```ts
import { salonHasFeature } from "@/lib/salon-features";
import { requireServiceApiKey } from "@/lib/service-keys/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonFeature } from "@/types/database";

export const KIOSK_FEATURE: SalonFeature = "kiosk";
export const KIOSK_SCOPE = "kiosk:sale";

export async function resolveKioskContext(
  headers: Headers,
  deps: { admin?: ReturnType<typeof createAdminClient>; now?: () => string } = {},
): Promise<{ salonId: string; scopes: string[] }> {
  const admin = deps.admin ?? createAdminClient();
  const identity = await requireServiceApiKey(headers, { admin, now: deps.now });
  if (!identity.scopes.includes(KIOSK_SCOPE)) {
    throw new Error("UNAUTHORIZED");
  }
  const enabled = await salonHasFeature(admin, identity.salonId, KIOSK_FEATURE);
  if (!enabled) throw new Error("FEATURE_NOT_ENABLED");
  return { salonId: identity.salonId, scopes: identity.scopes };
}
```

> Nota de implementación: `requireServiceApiKey` lee la cabecera `x-api-key`. En el kiosko la clave llega por **cookie HttpOnly** `kiosk_key` (Task 8). Las Server Actions (Task 6) leen esa cookie con `cookies()` y construyen un `Headers` con `x-api-key` para reutilizar `requireServiceApiKey` sin duplicar la verificación.

- [ ] **Step 4: Run → pasa.** `npm test -- src/tests/unit/kiosk-guard.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(kiosk): resolveKioskContext (device key + feature gate)"`

---

## Task 4: Código de recogida (helper puro)

**Files:**
- Create: `src/lib/kiosk/pickup-code.ts`
- Test: `src/tests/unit/kiosk-pickup-code.test.ts`

**Interfaces:**
- Produces: `formatPickupCode(n: number): string` → `"#" + n` con validación (`n>=1` entero). (La secuencia vive en SQL, Task 1; este helper solo formatea para UI.)

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest";
import { formatPickupCode } from "@/lib/kiosk/pickup-code";
it("formatea el código", () => { expect(formatPickupCode(13)).toBe("#13"); });
it("rechaza no-enteros o < 1", () => {
  expect(() => formatPickupCode(0)).toThrow();
  expect(() => formatPickupCode(1.5)).toThrow();
});
```

- [ ] **Step 2: Run → falla.** **Step 3: Implementar**

```ts
export function formatPickupCode(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("pickup code inválido");
  return `#${n}`;
}
```

- [ ] **Step 4: Run → pasa.** **Step 5: Commit** — `feat(kiosk): formatPickupCode`

---

## Task 5: Proyección segura del catálogo

**Files:**
- Create: `src/lib/kiosk/catalog.ts`
- Test: `src/tests/integration/kiosk-catalog.test.ts`

**Interfaces:**
- Consumes: cliente admin (inyectado en tests con el doble de Supabase); tabla `products` (campos: `id, name, description, price_cents, vat_rate, stock, active, image_url`).
- Produces: `getKioskCatalog(admin, salonId): Promise<KioskProduct[]>` con `KioskProduct = { id: string; name: string; description: string | null; priceCents: number; vatRate: number; imageUrl: string | null }` — SOLO productos `active=true`, ordenados por `name`, SIN exponer `stock` ni internos.

- [ ] **Step 1: Test que falla** (doble de Supabase que devuelve 1 producto activo)

```ts
import { describe, it, expect } from "vitest";
import { getKioskCatalog } from "@/lib/kiosk/catalog";

function adminReturning(rows: unknown[]) {
  const b: any = { select: () => b, eq: () => b, order: () => Promise.resolve({ data: rows, error: null }) };
  return { from: () => b } as never;
}

it("proyecta solo campos seguros y filtra a active", async () => {
  const admin = adminReturning([
    { id: "p1", name: "Champú", description: "d", price_cents: 1490, vat_rate: 21, image_url: "u" },
  ]);
  const out = await getKioskCatalog(admin, "s1");
  expect(out).toEqual([
    { id: "p1", name: "Champú", description: "d", priceCents: 1490, vatRate: 21, imageUrl: "u" },
  ]);
});
```

- [ ] **Step 2: Run → falla.** **Step 3: Implementar**

```ts
import type { createAdminClient } from "@/lib/supabase/admin";

export interface KioskProduct {
  id: string; name: string; description: string | null;
  priceCents: number; vatRate: number; imageUrl: string | null;
}

export async function getKioskCatalog(
  admin: ReturnType<typeof createAdminClient>, salonId: string,
): Promise<KioskProduct[]> {
  const { data, error } = await admin
    .from("products")
    .select("id, name, description, price_cents, vat_rate, image_url")
    .eq("salon_id", salonId).eq("active", true).order("name", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, description: p.description,
    priceCents: p.price_cents, vatRate: Number(p.vat_rate), imageUrl: p.image_url,
  }));
}
```

- [ ] **Step 4: Run → pasa.** **Step 5: Commit** — `feat(kiosk): getKioskCatalog (proyección segura)`

---

## Task 6: Validación + Server Action de pedido

**Files:**
- Create: `src/lib/validations/kiosk-order.ts`
- Create: `src/app/(kiosk)/kiosko/actions.ts`
- Test: `src/tests/integration/kiosk-create-order.test.ts`

**Interfaces:**
- Consumes: `resolveKioskContext` (Task 3), `getKioskCatalog` (Task 5), `computeSaleTotals`/`computeLineTotals` de `@/lib/payments`, `awardVisit` de `@/lib/loyalty/server` (tarjeta identificada), cliente admin.
- Produces:
  - `kioskOrderSchema` (Zod): `{ items: {productId:string; quantity:number}[] (>=1); payment: "card"|"cash"; idempotencyKey: string (uuid); cardTxId?: string; customerId?: string|null }`. `cardTxId` requerido si `payment==="card"`.
  - `createKioskOrder(input): Promise<{ ok:true; data:{ saleId:string; pickupCode:string; totalCents:number } } | { ok:false; error:string }>`.
  - `fetchKioskCatalog(): Promise<KioskProduct[]>` (lee cookie → contexto → catálogo).

- [ ] **Step 1: Test que falla — tarjeta crea venta completed + pago; efectivo crea open sin pago; rechaza producto ajeno** (doble de Supabase contando inserts; mock de `resolveKioskContext`, `getKioskCatalog`, `next/headers`)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/kiosk/guard", () => ({ resolveKioskContext: vi.fn(), KIOSK_SCOPE: "kiosk:sale" }));
vi.mock("@/lib/kiosk/catalog", () => ({ getKioskCatalog: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: "sk_kiosk_x" }) }) }));

const inserts: Record<string, unknown[]> = {};
function makeAdmin() {
  function builder(table: string) {
    let op = "select";
    const b: any = {
      select: () => b, eq: () => b, order: () => Promise.resolve({ data: [], error: null }),
      insert: (rows: unknown) => { op = "insert"; (inserts[table] ??= []).push(rows); return b; },
      single: () => Promise.resolve(op === "insert" && table === "pos_sales"
        ? { data: { id: "sale-1", pickup_code: "13" }, error: null } : { data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: "13", error: null }) } as never;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));

import { resolveKioskContext } from "@/lib/kiosk/guard";
import { getKioskCatalog } from "@/lib/kiosk/catalog";
import { createKioskOrder } from "@/app/(kiosk)/kiosko/actions";

beforeEach(() => { for (const k of Object.keys(inserts)) delete inserts[k];
  vi.mocked(resolveKioskContext).mockResolvedValue({ salonId: "s1", scopes: ["kiosk:sale"] });
  vi.mocked(getKioskCatalog).mockResolvedValue([
    { id: "p1", name: "Champú", description: null, priceCents: 1490, vatRate: 21, imageUrl: null },
  ]);
});

it("tarjeta: crea venta completed con pago tarjeta (ref=txId) y devuelve pickupCode", async () => {
  const r = await createKioskOrder({ items: [{ productId: "p1", quantity: 1 }], payment: "card", idempotencyKey: crypto.randomUUID(), cardTxId: "TX-9" });
  expect(r.ok).toBe(true);
  const sale = inserts["pos_sales"]![0] as Record<string, unknown>;
  expect(sale.status).toBe("completed");
  expect(sale.channel).toBe("kiosk");
  expect(sale.fulfillment_status).toBe("pending");
  const pay = inserts["pos_payments"]![0] as Record<string, unknown>[];
  expect(pay[0].method).toBe("tarjeta");
  expect(pay[0].reference).toBe("TX-9");
});

it("efectivo: crea venta open y NO inserta pago", async () => {
  const r = await createKioskOrder({ items: [{ productId: "p1", quantity: 1 }], payment: "cash", idempotencyKey: crypto.randomUUID() });
  expect(r.ok).toBe(true);
  expect((inserts["pos_sales"]![0] as Record<string, unknown>).status).toBe("open");
  expect(inserts["pos_payments"]).toBeUndefined();
});

it("rechaza items cuyo product no está en el catálogo del salón", async () => {
  const r = await createKioskOrder({ items: [{ productId: "ajeno", quantity: 1 }], payment: "cash", idempotencyKey: crypto.randomUUID() });
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2: Run → falla.**

- [ ] **Step 3: Implementar** `kioskOrderSchema` y `createKioskOrder` (mirror de `createSale` en `src/app/(dashboard)/tpv/actions.ts:135`; admin + gateado + totales desde catálogo del servidor; idempotencia por `idempotency_key` con manejo de `23505`; efectivo `status:'open'` sin `pos_payments`; tarjeta `status:'completed'` + `pos_payments` (method `'tarjeta'`, `reference: cardTxId`); `pickup_code` desde `admin.rpc("next_kiosk_pickup_code",{p_salon_id})`; loyalty en tarjeta best-effort si `customerId`; rollback de compensación borrando la venta ante fallo posterior).

```ts
"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { computeLineTotals, computeSaleTotals } from "@/lib/payments";
import { getKioskCatalog } from "@/lib/kiosk/catalog";
import { resolveKioskContext } from "@/lib/kiosk/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/types/database";

export const kioskOrderSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  payment: z.enum(["card", "cash"]),
  idempotencyKey: z.string().uuid(),
  cardTxId: z.string().min(1).optional(),
  customerId: z.string().uuid().nullable().optional(),
}).refine((v) => v.payment !== "card" || (v.cardTxId?.length ?? 0) > 0, { message: "cardTxId requerido para tarjeta" });
export type KioskOrderInput = z.infer<typeof kioskOrderSchema>;

async function kioskHeaders(): Promise<Headers> {
  const key = cookies().get("kiosk_key")?.value ?? "";
  return new Headers({ "x-api-key": key });
}

export async function fetchKioskCatalog() {
  const admin = createAdminClient();
  const { salonId } = await resolveKioskContext(await kioskHeaders(), { admin });
  return getKioskCatalog(admin, salonId);
}

export async function createKioskOrder(input: KioskOrderInput) {
  const parsed = kioskOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const admin = createAdminClient();
  let salonId: string;
  try { ({ salonId } = await resolveKioskContext(await kioskHeaders(), { admin })); }
  catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "No autorizado" }; }

  // Idempotencia: si ya existe una venta con esta clave, devolverla.
  const { data: existing } = await admin.from("pos_sales")
    .select("id, pickup_code, total_cents").eq("salon_id", salonId)
    .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing) return { ok: true as const, data: { saleId: existing.id, pickupCode: `#${existing.pickup_code}`, totalCents: existing.total_cents } };

  // Precios AUTORITATIVOS desde el catálogo del servidor (no se confía en el cliente).
  const catalog = await getKioskCatalog(admin, salonId);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let lines;
  try {
    lines = parsed.data.items.map((it) => {
      const p = byId.get(it.productId);
      if (!p) throw new Error("Producto no disponible");
      return { p, quantity: it.quantity };
    });
  } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Producto no disponible" }; }

  // Alinear con la firma REAL de @/lib/payments (ver createSale/toLineInput).
  const lineInputs = lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.p.priceCents, vatRate: l.p.vatRate }));
  const totals = computeSaleTotals(lineInputs as never);
  const { data: code } = await admin.rpc("next_kiosk_pickup_code", { p_salon_id: salonId });

  const saleInsert: TablesInsert<"pos_sales"> = {
    salon_id: salonId, channel: "kiosk", fulfillment_status: "pending",
    idempotency_key: parsed.data.idempotencyKey, pickup_code: String(code),
    customer_id: parsed.data.customerId ?? null,
    status: parsed.data.payment === "card" ? "completed" : "open",
    subtotal_cents: totals.subtotalCents, discount_cents: totals.discountCents,
    tax_cents: totals.taxCents, total_cents: totals.totalCents, currency: "EUR",
  };
  const { data: sale, error: saleErr } = await admin.from("pos_sales").insert(saleInsert).select("id, pickup_code").single();
  if (saleErr || !sale) return { ok: false as const, error: saleErr?.message ?? "No se pudo crear el pedido" };

  const lineInserts: TablesInsert<"pos_sale_lines">[] = lines.map((l) => ({
    salon_id: salonId, sale_id: sale.id, product_id: l.p.id, description: l.p.name,
    quantity: l.quantity, unit_price_cents: l.p.priceCents, discount_cents: 0, vat_rate: l.p.vatRate,
    line_total_cents: computeLineTotals({ quantity: l.quantity, unitPriceCents: l.p.priceCents, vatRate: l.p.vatRate } as never).grossCents,
  }));
  const { error: linesErr } = await admin.from("pos_sale_lines").insert(lineInserts);
  if (linesErr) { await admin.from("pos_sales").delete().eq("id", sale.id).eq("salon_id", salonId); return { ok: false as const, error: linesErr.message }; }

  if (parsed.data.payment === "card") {
    const payIns: TablesInsert<"pos_payments">[] = [{ salon_id: salonId, sale_id: sale.id, method: "tarjeta", amount_cents: totals.totalCents, reference: parsed.data.cardTxId ?? null }];
    const { error: payErr } = await admin.from("pos_payments").insert(payIns);
    if (payErr) { await admin.from("pos_sales").delete().eq("id", sale.id).eq("salon_id", salonId); return { ok: false as const, error: payErr.message }; }
    // SUB-PASO (reutilizar módulos existentes, NO lógica nueva):
    //   1. VeriFactu: emitir el ticket de la venta con @/lib/invoicing (como el TPV al completar).
    //   2. Loyalty: si parsed.data.customerId != null, awardVisit best-effort con ref {type:"pos_sale", id: sale.id}.
  }
  return { ok: true as const, data: { saleId: sale.id, pickupCode: `#${sale.pickup_code}`, totalCents: totals.totalCents } };
}
```

> Sub-nota: verificar la firma real de `computeSaleTotals`/`computeLineTotals` en `@/lib/payments` (en `createSale` la cantidad es string y `toLineInput` la mapea; alinear el tipo de `quantity` a lo que esperen). El test de Task 6 y el de `payments/totals` deben quedar verdes.

- [ ] **Step 4: Run → pasa** (`kiosk-create-order.test.ts`) + `npm test` global verde.
- [ ] **Step 5: Commit** — `feat(kiosk): createKioskOrder + kioskOrderSchema (card/cash, idempotente)`

---

## Task 7: PaymentBridge (cliente) + MockPaymentBridge

**Files:**
- Create: `src/lib/kiosk/payment-bridge.ts`
- Test: `src/tests/unit/kiosk-payment-bridge.test.ts`

**Interfaces:**
- Produces:
  - `interface PaymentBridge { readonly id: string; cobrar(input: { totalCents: number; idempotencyKey: string }): Promise<{ ok: true; txId: string } | { ok: false; reason: string }> }`
  - `MockPaymentBridge` (dev/web): resuelve OK con `txId="MOCK-"+idempotencyKey` salvo que `totalCents<=0` → `{ ok:false }`.
  - `getPaymentBridge(): PaymentBridge` — devuelve `MockPaymentBridge` salvo que exista `window.SumUpBridge` (lo pondrá la carcasa en Plan 2).

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest";
import { MockPaymentBridge, getPaymentBridge } from "@/lib/kiosk/payment-bridge";
it("mock cobra OK y devuelve txId estable por idempotencyKey", async () => {
  const r = await new MockPaymentBridge().cobrar({ totalCents: 5900, idempotencyKey: "abc" });
  expect(r).toEqual({ ok: true, txId: "MOCK-abc" });
});
it("mock falla con total <= 0", async () => {
  const r = await new MockPaymentBridge().cobrar({ totalCents: 0, idempotencyKey: "abc" });
  expect(r.ok).toBe(false);
});
it("getPaymentBridge devuelve el mock por defecto", () => {
  expect(getPaymentBridge().id).toBe("mock");
});
```

- [ ] **Step 2: Run → falla.** **Step 3: Implementar** el módulo. **Step 4: Run → pasa.** **Step 5: Commit** — `feat(kiosk): PaymentBridge + MockPaymentBridge`

---

## Task 8: Route de activación del dispositivo

**Files:**
- Create: `src/app/kiosko/activar/route.ts`
- Test: `src/tests/integration/kiosk-activar-route.test.ts`

**Interfaces:**
- Consumes: `resolveKioskContext` (valida la clave del query).
- Produces: `GET /kiosko/activar?key=sk_kiosk_…` → valida la clave; si OK, set-cookie **HttpOnly, Secure, SameSite=Lax** `kiosk_key=<clave>` (larga duración) y `302` a `/kiosko`; si falla, `401`. La clave nunca llega al JS del cliente (cookie HttpOnly).

- [ ] **Step 1: Test que falla** (mock `resolveKioskContext`; construir `NextRequest` con `?key=`; afirmar Set-Cookie HttpOnly + redirect).
- [ ] **Step 2: Run → falla.** **Step 3: Implementar** el Route Handler (`export const dynamic = "force-dynamic"`; leer `req.nextUrl.searchParams.get("key")`; `Headers({'x-api-key':key})`; `resolveKioskContext`; `NextResponse.redirect` + `cookies().set('kiosk_key', key, { httpOnly:true, secure:true, sameSite:'lax', path:'/', maxAge: 60*60*24*365 })`). **Step 4: Run → pasa.** **Step 5: Commit** — `feat(kiosk): route de activación (clave → cookie HttpOnly)`

---

## Task 9: UI del kiosko (Liquid Glass · Perla)

**Files:**
- Create: `src/app/(kiosk)/layout.tsx`, `src/app/(kiosk)/kiosko/page.tsx`, `src/app/(kiosk)/kiosko/kiosk-view.tsx`, componentes en `src/app/(kiosk)/kiosko/components/*`, estilos `kiosk.module.css`.
- Test: `src/tests/unit/kiosk-view.test.tsx`

**Interfaces:**
- Consumes: `fetchKioskCatalog`/`createKioskOrder` (Task 6), `getPaymentBridge` (Task 7), `KioskProduct`, branding del salón (`@/lib/salon-branding`).
- Produces: pantalla completa del kiosko según el **mockup aprobado** (`docs/superpowers/specs/assets/2026-07-31-kiosko-liquid-glass-perla.html`): nav de vidrio, héroe destacado, galería con **cajas de foto de altura fija** (`<img object-fit:cover>` desde `imageUrl`, título/precio debajo), barra de carrito, paso de fidelidad opcional, flujo de pago (tarjeta vía bridge / efectivo) y confirmación con `pickupCode`.

- [ ] **Step 1: Fuentes** — configurar `next/font/google` Playfair Display + Inter en `(kiosk)/layout.tsx` (self-hosted por `next/font`, sin CDN). Exponer como CSS vars `--font-serif`/`--font-sans`.
- [ ] **Step 2: Gate por feature** — `page.tsx` (server): resolver salón por cookie; si `resolveKioskContext` lanza `FEATURE_NOT_ENABLED`/`UNAUTHORIZED` → `notFound()` (404).
- [ ] **Step 3: Test de la vista que falla** — `kiosk-view.test.tsx`: (1) cada tarjeta tiene un contenedor de foto con clase `.photo` (altura fija) y el título va DESPUÉS en el DOM; (2) al pulsar "Pagar con tarjeta" se llama `createKioskOrder` con `payment:"card"` y el `txId` del bridge mock; (3) tras OK se muestra el `pickupCode` "#13". **Run → falla.**
- [ ] **Step 4: Implementar** `kiosk-view.tsx` + componentes portando la estructura/tokens del mockup (Perla). Reglas no negociables (mockup + feedback de Jose): la caja de foto es un contenedor de **altura fija** con `overflow:hidden`; el `<img>` usa `object-fit:cover`; el **título y el precio van SIEMPRE debajo**. Estados: carrito vacío, cargando, error de pago (vuelve al método de pago con mensaje), confirmación con auto-reset a INICIO a ~8s.
- [ ] **Step 5: Run tests + revisión visual** — `npm test -- src/tests/unit/kiosk-view.test.tsx` PASS; `npm run dev` → `/kiosko/activar?key=<clave dev>` → comparar con el mockup.
- [ ] **Step 6: Commit** — `feat(kiosk): UI del kiosko (Liquid Glass Perla, cajas de foto reservadas)`

---

## Task 10: Pantalla de pedidos del personal (Realtime)

**Files:**
- Create: `src/app/(dashboard)/kiosko/page.tsx`, `orders-view.tsx`, `actions.ts`
- Modify: `src/components/dashboard-nav-items.ts` (ítem "Kiosko", gateado por feature `kiosk`)
- Test: `src/tests/unit/kiosk-orders-view.test.tsx`, `src/tests/integration/kiosk-deliver.test.ts`

**Interfaces:**
- Consumes: `pos_sales` (RLS de miembro ya lo permite) filtrando `channel='kiosk'` y `fulfillment_status='pending'`; suscripción Realtime del cliente Supabase; `getActiveSalonId`.
- Produces: `markKioskOrderDelivered(saleId): Promise<ActionResult<void>>` (update `fulfillment_status='delivered'` con `createClient()` RLS-miembro, acotado a salón activo). La vista muestra dos columnas (pendiente cobro / pagado→entregar), botón "Entregar" y enlace "Cobrar en TPV" (`/tpv?sale=<id>`).

- [ ] **Step 1: Test `markKioskOrderDelivered` que falla** (doble de Supabase: verifica update a `delivered` acotado por `salon_id`+`id`). **Step 2: Run → falla. Step 3: Implementar** la Server Action (patrón `ActionResult`, `getActiveSalonId`, `revalidatePath('/kiosko')`). **Step 4: Run → pasa.**
- [ ] **Step 5: Test de la vista** (render con 2 pedidos mock: uno `open` (efectivo) y uno `completed`+`pending` (tarjeta); afirmar "Cobrar en TPV" en el de efectivo y "Entregar" en el de tarjeta). **Step 6: Implementar** `orders-view.tsx` con la suscripción Realtime (mismo patrón que el day-panel existente). **Step 7:** añadir el ítem de nav gateado. **Step 8: Run tests → pasan.**
- [ ] **Step 9: Commit** — `feat(kiosk): pantalla de pedidos del personal (Realtime) + entregar/cobrar`

---

## Task 11: Imagen en el formulario de producto

**Files:**
- Modify: `src/lib/validations/product.ts`, `src/app/(dashboard)/products/product-form.tsx`, `src/app/(dashboard)/products/actions.ts`
- Test: `src/tests/unit/product-form.test.tsx` (ampliar)

**Interfaces:**
- Produces: subida de imagen al bucket `product-images` (path `${salonId}/${productId}.<ext>`) y persistencia de `image_url` en `products`. El kiosko (Task 9) ya la consume vía `KioskProduct.imageUrl`.

- [ ] **Step 1: Test** — el formulario acepta un archivo y, al guardar, `actions` sube al bucket y guarda `image_url` (mockear Storage). **Step 2: Run → falla. Step 3: Implementar** (reutilizar el patrón de subida de `salon_logos`). **Step 4: Run → pasa. Step 5: Commit** — `feat(products): subida de foto de producto`

---

## Task 12: Alta del piloto (denueveanueve)

**Files:**
- Create: `scripts/enable-kiosk.ts`
- Docs: añadir sección a `docs/service-keys-emision.md` (o crear `docs/kiosk-activacion.md`)

**Interfaces:**
- Consumes: `issueServiceApiKey({ salonId, name, scopes:["kiosk:sale"] })` de `@/lib/service-keys/issue`; upsert en `salon_features` (feature `kiosk`, `enabled=true`).
- Produces: script `tsx scripts/enable-kiosk.ts --salon <slug|id>` que (1) activa el feature `kiosk` del salón y (2) emite una clave de dispositivo `sk_kiosk_…` (scope `kiosk:sale`) y la imprime UNA vez, con la URL de activación `/kiosko/activar?key=…` para pegar en la tablet.

- [ ] **Step 1:** Implementar el script (cliente admin; imprime la clave y la URL; NO la persiste en logs). **Step 2:** Ejecutar contra denueveanueve: `tsx scripts/enable-kiosk.ts --salon denueveanueve`. **Step 3:** Verificar en `npm run dev` que `/kiosko/activar?key=<clave>` deja el kiosko operativo y que un salón SIN el feature devuelve 404. **Step 4: Commit** — `feat(kiosk): script de alta + activación del piloto denueveanueve`

---

## Self-Review

**Cobertura del spec (§ → tarea):** §3 kiosko web → T9; PaymentBridge → T7; RPC pedido (como Server Action) → T6; RPC catálogo (como fn) → T5; pantalla pedidos → T10; §4 datos → T1; §6 bridge aislado/testeable → T7/T9; §7 seguridad (clave dispositivo + gate + totales servidor) → T3/T6/T8; §8 idempotencia/fiscal/loyalty → T6; §9 pantalla personal → T10; §11 fotos de producto → T2/T11; §12 alta → T12; §13 dirección visual → T9. **Fuera de esta fase (Plan 2):** carcasa Capacitor + `SumUpBridge` real + screen pinning (spec §3/§6, build-order paso 4).

**Escaneo de placeholders:** el código de T6 marca dos sub-notas explícitas (VeriFactu/loyalty en tarjeta; firma exacta de `computeSaleTotals`) que el implementador resuelve reutilizando módulos YA probados (`lib/invoicing`, `awardVisit`) — no son lógica nueva sin especificar, sino puntos de integración. La UI (T9) referencia el mockup como fuente de verdad en vez de reproducir todo el CSS.

**Consistencia de tipos:** `KioskProduct` (T5) se consume igual en T6/T9; `resolveKioskContext` firma estable T3→T6/T8; `createKioskOrder`/`kioskOrderSchema` T6 consumidos por T9; `PaymentBridge` T7 consumido por T9; `pickup_code` (SQL, T1) formateado por `formatPickupCode` (T4) y devuelto como `#N` en T6.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-31-kiosko-tienda-autoservicio-salon-os.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
