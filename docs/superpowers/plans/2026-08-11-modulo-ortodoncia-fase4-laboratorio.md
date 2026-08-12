# Módulo Ortodoncia — Fase 4 (laboratorio + alineadores) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a `/ortodoncia` una pestaña "Laboratorio" (pedidos a laboratorio con estados enviado→recibido→entregado) y la trazabilidad de alineadores (total en el tratamiento + entregados derivado de las visitas) en la pestaña "Ficha y tratamiento".

**Architecture:** Tabla nueva `lab_order` (estado DERIVADO de las fechas, no almacenado). La trazabilidad de alineadores reutiliza `ortho_visit.actions.alignerDelivered` (ya existe) + un `alignerTotal` que vive en `clinical_records.data.ortho.treatment` (JSONB, sin migración). Lógica pura testeada; server actions con el patrón `assertOrthoAccess`; UI con `ui-ux-pro-max`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (Postgres + RLS), Zod, TanStack Query v5, Vitest, Tailwind + shadcn/ui.

## Global Constraints

- Rama `hat3x/HAT3X-038` (repo `clients/projects/salon-os`).
- Fechas ISO `YYYY-MM-DD`. Todo escritura acotada por `salon_id`; sector gate `salon.sector !== "odontologia"` en cada server action.
- Gate de rol: crear/recibir/entregar pedido = **owner/manager/staff**; borrar pedido = **owner/manager**. (El `alignerTotal` se guarda con `saveOrthoData` existente, que ya es owner/manager.)
- **RSC boundary** ([[reference_salonos_rsc_boundary]]): componentes cliente NUNCA importan de `@/lib/salon`; `salonId` llega por prop.
- Estado de `lab_order` **derivado** de las fechas (`delivered_at` → entregado; `received_at` → recibido; si no → enviado). No se almacena estado.
- Migraciones por Supabase Management API — **las aplica el usuario** (SQL editor). project-ref `jztoyekixcziaicrnlce`. El `alignerTotal` NO lleva migración (JSONB).
- **UI con `ui-ux-pro-max`**: Tasks 7 y 8 DEBEN invocar la skill antes de escribir la UI.
- Verde: `npx tsc --noEmit` = 0 y suite Vitest completa antes de desplegar. Deploy por `scratchpad/deploy_kairos.js`.

---

### Task 1: Lógica pura (estado de pedido + progreso de alineadores) + tipo alignerTotal

**Files:**
- Create: `src/lib/dental/lab-orders.ts`
- Modify: `src/lib/dental/ortho.ts` (añadir `alignerTotal` a `OrthoTreatment` y a `EMPTY_ORTHO_TREATMENT`)
- Modify: `src/lib/dental/index.ts` (`export * from "./lab-orders";` — si existe el barrel; si no, omitir este archivo)
- Test: `src/tests/unit/lab-orders-logic.test.ts`

**Interfaces:**
- Produces: tipos `LabOrderKind`, `LabOrderStatus`; label maps `LAB_ORDER_KIND_LABELS`, `LAB_ORDER_STATUS_LABELS`; `labOrderStatus(order)`; `AlignerProgress`, `computeAlignerProgress(alignerTotal, deliveredNumbers)`. Extiende `OrthoTreatment` con `alignerTotal: number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/lab-orders-logic.test.ts
import { describe, it, expect } from "vitest";

import {
  computeAlignerProgress,
  labOrderStatus,
  LAB_ORDER_KIND_LABELS,
} from "@/lib/dental/lab-orders";

describe("labOrderStatus", () => {
  it("enviado cuando solo hay sentAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: null, deliveredAt: null })).toBe("enviado");
  });
  it("recibido cuando hay receivedAt pero no deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: null })).toBe("recibido");
  });
  it("entregado cuando hay deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: "2026-08-06" })).toBe("entregado");
  });
});

describe("computeAlignerProgress", () => {
  it("entregados = mayor alignerDelivered; pendientes = total - entregados", () => {
    const p = computeAlignerProgress(24, [3, 7, null, 5]);
    expect(p).toEqual({ total: 24, delivered: 7, pending: 17 });
  });
  it("sin total → todo 0, pendientes no negativo", () => {
    expect(computeAlignerProgress(null, [2])).toEqual({ total: 0, delivered: 2, pending: 0 });
  });
  it("sin entregas → delivered 0", () => {
    expect(computeAlignerProgress(10, [])).toEqual({ total: 10, delivered: 0, pending: 10 });
  });
});

describe("LAB_ORDER_KIND_LABELS", () => {
  it("cubre las 5 clases", () => {
    expect(Object.keys(LAB_ORDER_KIND_LABELS)).toHaveLength(5);
    expect(LAB_ORDER_KIND_LABELS.alineadores).toBe("Alineadores");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/tests/unit/lab-orders-logic.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dental/lab-orders.ts
/** Pedidos a laboratorio + progreso de alineadores (Fase 4). Puro, sin IO. */

export type LabOrderKind = "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
export type LabOrderStatus = "enviado" | "recibido" | "entregado";

export const LAB_ORDER_KIND_LABELS: Record<LabOrderKind, string> = {
  modelo: "Modelo",
  retenedor: "Retenedor",
  alineadores: "Alineadores",
  ortopedia: "Ortopedia",
  otro: "Otro",
};

export const LAB_ORDER_STATUS_LABELS: Record<LabOrderStatus, string> = {
  enviado: "Enviado",
  recibido: "Recibido",
  entregado: "Entregado",
};

/** Estado derivado de las fechas del pedido (no se almacena). */
export function labOrderStatus(order: {
  sentAt: string;
  receivedAt: string | null;
  deliveredAt: string | null;
}): LabOrderStatus {
  if (order.deliveredAt !== null) return "entregado";
  if (order.receivedAt !== null) return "recibido";
  return "enviado";
}

export interface AlignerProgress {
  total: number;
  delivered: number;
  pending: number;
}

/**
 * Progreso de alineadores. `deliveredNumbers` = el `alignerDelivered` de cada visita
 * (nº del alineador entregado en esa visita; null si no se entregó). Entregados = el mayor
 * de esos números; pendientes = total − entregados (nunca negativo).
 */
export function computeAlignerProgress(
  alignerTotal: number | null,
  deliveredNumbers: readonly (number | null)[],
): AlignerProgress {
  const total = alignerTotal ?? 0;
  const delivered = deliveredNumbers.reduce<number>(
    (max, n) => (n !== null && n > max ? n : max),
    0,
  );
  const pending = Math.max(0, total - delivered);
  return { total, delivered, pending };
}
```

En `src/lib/dental/ortho.ts`, añadir el campo a `OrthoTreatment` (tras `objectives`) y a
`EMPTY_ORTHO_TREATMENT`:
```ts
// en interface OrthoTreatment:
  alignerTotal: number | null;
```
```ts
// en EMPTY_ORTHO_TREATMENT:
  alignerTotal: null,
```
Si existe un barrel `src/lib/dental/index.ts` que re-exporta los módulos dentales, añadir `export * from "./lab-orders";`. Si no existe barrel (los consumidores importan por ruta directa), **omitir** este archivo y este paso.

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/tests/unit/lab-orders-logic.test.ts` → PASS. Luego `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dental/lab-orders.ts src/lib/dental/ortho.ts src/tests/unit/lab-orders-logic.test.ts
git commit -m "feat(ortodoncia): logica laboratorio + progreso alineadores + alignerTotal"
```

---

### Task 2: Validación Zod (pedido + alignerTotal en tratamiento)

**Files:**
- Create: `src/lib/validations/lab-orders.ts`
- Modify: `src/lib/validations/ortho.ts` (añadir `alignerTotal` a `orthoTreatmentSchema`)
- Test: `src/tests/unit/lab-orders-schema.test.ts`

**Interfaces:**
- Produces: `createLabOrderSchema`, `CreateLabOrderInput`; `markLabDateSchema`, `MarkLabDateInput`. Extiende `orthoTreatmentSchema` con `alignerTotal`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/lab-orders-schema.test.ts
import { describe, it, expect } from "vitest";

import { createLabOrderSchema, markLabDateSchema } from "@/lib/validations/lab-orders";
import { orthoTreatmentSchema } from "@/lib/validations/ortho";

describe("createLabOrderSchema", () => {
  const base = { kind: "alineadores", labName: "Lab X", sentAt: "2026-08-10" };
  it("acepta un pedido válido", () => {
    expect(createLabOrderSchema.safeParse(base).success).toBe(true);
  });
  it("rechaza un kind inválido", () => {
    expect(createLabOrderSchema.safeParse({ ...base, kind: "corona" }).success).toBe(false);
  });
  it("rechaza fecha no-ISO", () => {
    expect(createLabOrderSchema.safeParse({ ...base, sentAt: "10/08/2026" }).success).toBe(false);
  });
});

describe("markLabDateSchema", () => {
  it("acepta fecha ISO", () => {
    expect(markLabDateSchema.safeParse({ date: "2026-08-12" }).success).toBe(true);
  });
  it("rechaza fecha no-ISO", () => {
    expect(markLabDateSchema.safeParse({ date: "hoy" }).success).toBe(false);
  });
});

describe("orthoTreatmentSchema alignerTotal", () => {
  it("acepta alignerTotal entero y nulo (default)", () => {
    expect(orthoTreatmentSchema.safeParse({ alignerTotal: 24 }).success).toBe(true);
    expect(orthoTreatmentSchema.safeParse({}).success).toBe(true); // default null
  });
  it("rechaza alignerTotal 0", () => {
    expect(orthoTreatmentSchema.safeParse({ alignerTotal: 0 }).success).toBe(false);
  });
});
```

> **Nota para el implementador:** `orthoTreatmentSchema.safeParse({})` debe seguir pasando (todos los campos con default/optional). Si en el schema actual algún campo es requerido sin default, ajusta el test para incluir un objeto de tratamiento mínimo válido en vez de `{}`, pero **no cambies** la obligatoriedad de campos existentes. Lo que se verifica aquí es únicamente que `alignerTotal` acepta entero, nulo por defecto, y rechaza 0.

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/tests/unit/lab-orders-schema.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/lab-orders.ts
import { z } from "zod";

export const createLabOrderSchema = z.object({
  kind: z.enum(["modelo", "retenedor", "alineadores", "ortopedia", "otro"]),
  labName: z.string().trim().max(200).nullable().default(null),
  sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  notes: z.string().trim().max(2000).nullable().default(null),
});

export type CreateLabOrderInput = z.input<typeof createLabOrderSchema>;

export const markLabDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
});

export type MarkLabDateInput = z.input<typeof markLabDateSchema>;
```

En `src/lib/validations/ortho.ts`, dentro de `orthoTreatmentSchema` (junto a los demás campos):
```ts
  alignerTotal: z.number().int().min(1).max(120).nullable().default(null),
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/tests/unit/lab-orders-schema.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/lab-orders.ts src/lib/validations/ortho.ts src/tests/unit/lab-orders-schema.test.ts
git commit -m "feat(ortodoncia): esquemas Zod pedido laboratorio + alignerTotal"
```

---

### Task 3: Migración `lab_order` + tipo en database.ts

**Files:**
- Create: `supabase/migrations/20260811140000_lab_order.sql`
- Modify: `src/types/database.ts` (tabla `lab_order` + alias `LabOrder`)

**Interfaces:**
- Produces: tabla `public.lab_order`; enum `lab_order_kind`; tipo `LabOrder = Tables<"lab_order">`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260811140000_lab_order.sql
-- Pedidos a laboratorio de ortodoncia (Fase 4). Estado derivado de las fechas en la app.
--
-- APLICACIÓN VÍA MANAGEMENT API (la aplica el usuario en el SQL editor):
--   POST https://api.supabase.com/v1/projects/jztoyekixcziaicrnlce/database/migrations
--   Content-Type: application/sql
--   Body: <contenido de este archivo>

begin;

create type public.lab_order_kind as enum ('modelo', 'retenedor', 'alineadores', 'ortopedia', 'otro');

create table public.lab_order (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references public.salons(id) on delete cascade,
  customer_id  uuid not null,
  kind         public.lab_order_kind not null,
  lab_name     text,
  sent_at      date not null,
  received_at  date,
  delivered_at date,
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lab_order_customer_fk
    foreign key (customer_id, salon_id)
    references public.clinical_records (customer_id, salon_id) on delete cascade
);

create index lab_order_customer_idx on public.lab_order (salon_id, customer_id, sent_at desc);

alter table public.lab_order enable row level security;

create policy lab_order_rw on public.lab_order
  for all using (salon_id in (select app.user_salon_ids()))
  with check (salon_id in (select app.user_salon_ids()));

commit;
```

> **Nota:** confirmar contra una migración dental existente (p. ej. `20260811130000_ortho_payments.sql`) que el nombre de la tabla de salones es `public.salons`, que la referencia `salons(id)` y el patrón RLS `app.user_salon_ids()` coinciden con lo ya usado; ajustar si el proyecto usa otro nombre. Reutilizar exactamente el mismo patrón que la migración de Fase 2.

- [ ] **Step 2: Aplicar la migración (usuario) y verificar** — el usuario aplica el SQL; verificar por REST:
```
GET https://jztoyekixcziaicrnlce.supabase.co/rest/v1/lab_order?select=id&limit=1
  apikey: <anon>  Authorization: Bearer <anon>
```
Expected: `200 []`.

- [ ] **Step 3: Tipo en `database.ts`** — dentro de `Database["public"]["Tables"]`, junto a las dentales, añadir el bloque `lab_order` (Row/Insert/Update/Relationships) siguiendo el molde de `ortho_visit`: columnas del `create table` (`sent_at` `string`; `received_at`/`delivered_at`/`lab_name`/`notes`/`created_by` → `string | null`; `created_at`/`updated_at` → `string`; `kind` → union `"modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro"`; defaults/nullables → opcionales en Insert). Y el alias junto a los demás:
```ts
export type LabOrder = Tables<"lab_order">;
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811140000_lab_order.sql src/types/database.ts
git commit -m "feat(ortodoncia): tabla lab_order + tipo (RLS por tenant)"
```

---

### Task 4: Queries (lectura de pedidos)

**Files:**
- Create: `src/lib/queries/lab-orders.ts`

**Interfaces:**
- Consumes: `LabOrder` (Task 3), `createClient` de `@/lib/supabase/client`.
- Produces: `labOrderKeys`; `fetchLabOrders(salonId, customerId): Promise<LabOrder[]>`.

- [ ] **Step 1: Escribir la implementación** (confirmar el import del cliente browser mirando `src/lib/queries/ortho-payments.ts`)

```ts
// src/lib/queries/lab-orders.ts
import { createClient } from "@/lib/supabase/client";
import type { LabOrder } from "@/types/database";

export const labOrderKeys = {
  all: (salonId: string) => ["lab-orders", salonId] as const,
  list: (salonId: string, customerId: string) =>
    [...labOrderKeys.all(salonId), "list", customerId] as const,
};

/** Pedidos a laboratorio del paciente (más reciente primero). */
export async function fetchLabOrders(salonId: string, customerId: string): Promise<LabOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lab_order")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/lab-orders.ts
git commit -m "feat(ortodoncia): queries pedidos de laboratorio"
```

---

### Task 5: Server actions (crear / recibir / entregar / borrar)

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/lab-actions.ts`
- Test: `src/tests/unit/lab-order-actions.test.ts`

**Interfaces:**
- Consumes: `createLabOrderSchema`, `CreateLabOrderInput`, `markLabDateSchema`, `MarkLabDateInput` (Task 2); `LabOrder`, `MemberRole` (types); `getActiveSalon`, `getActiveMembership` (`@/lib/salon`); `createClient` (`@/lib/supabase/server`).
- Produces: `ActionResult<T>`; `createLabOrder(customerId, input)`; `markLabOrderReceived(orderId, input)`; `markLabOrderDelivered(orderId, input)`; `deleteLabOrder(orderId)`.

> **Antes de implementar:** abre `src/app/(dashboard)/ortodoncia/payment-actions.ts` y REPLICA su patrón exacto de gate — el nombre real de los helpers (`getActiveSalon`/`getActiveMembership` o equivalente), la forma de leer el rol del membership, el tipo `MemberRole` y el shape de `ActionResult`. El código de abajo es la referencia; ajústalo a los nombres reales de ese archivo para no divergir.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/lab-order-actions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, getUserMock } = vi.hoisted(() => ({
  getActiveSalonMock: vi.fn(),
  getActiveMembershipMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: (t: string) => fromMock(t), auth: { getUser: () => getUserMock() } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createLabOrder, deleteLabOrder } from "@/app/(dashboard)/ortodoncia/lab-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createLabOrder", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    const res = await createLabOrder("c1", { kind: "alineadores", labName: "Lab", sentAt: "2026-08-10" });
    expect(res.ok).toBe(false);
  });

  it("staff puede crear (inserta acotado por salon)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    let inserted: Record<string, unknown> | null = null;
    fromMock.mockReturnValue({
      insert: (p: Record<string, unknown>) => {
        inserted = p;
        return { select: () => ({ single: async () => ({ data: { id: "lo1" }, error: null }) }) };
      },
    });
    const res = await createLabOrder("c1", { kind: "alineadores", labName: "Lab X", sentAt: "2026-08-10" });
    expect(res.ok).toBe(true);
    const w = inserted as { salon_id: string; customer_id: string; kind: string; sent_at: string };
    expect(w.salon_id).toBe("s1");
    expect(w.customer_id).toBe("c1");
    expect(w.kind).toBe("alineadores");
    expect(w.sent_at).toBe("2026-08-10");
  });
});

describe("deleteLabOrder", () => {
  it("rechaza a staff (borrar es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    const res = await deleteLabOrder("lo1");
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/tests/unit/lab-order-actions.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/(dashboard)/ortodoncia/lab-actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  createLabOrderSchema,
  markLabDateSchema,
  type CreateLabOrderInput,
  type MarkLabDateInput,
} from "@/lib/validations/lab-orders";
import type { LabOrder, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

const STAFF_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];
const MANAGER_ROLES: readonly MemberRole[] = ["owner", "manager"];

async function assertLabAccess(
  requiredRoles: readonly MemberRole[],
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };
  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/** Crea un pedido a laboratorio (estado inicial: enviado). Owner/manager/staff. */
export async function createLabOrder(
  customerId: string,
  input: CreateLabOrderInput,
): Promise<ActionResult<LabOrder>> {
  const parsed = createLabOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertLabAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("lab_order")
    .insert({
      salon_id: access.salonId,
      customer_id: customerId,
      kind: parsed.data.kind,
      lab_name: parsed.data.labName,
      sent_at: parsed.data.sentAt,
      notes: parsed.data.notes,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data };
}

async function setLabDate(
  orderId: string,
  column: "received_at" | "delivered_at",
  input: MarkLabDateInput,
): Promise<ActionResult<null>> {
  const parsed = markLabDateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Fecha no válida" };
  }
  const access = await assertLabAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("lab_order")
    .update({ [column]: parsed.data.date, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Marca el pedido como recibido en la clínica. Owner/manager/staff. */
export function markLabOrderReceived(orderId: string, input: MarkLabDateInput): Promise<ActionResult<null>> {
  return setLabDate(orderId, "received_at", input);
}

/** Marca el pedido como entregado al paciente. Owner/manager/staff. */
export function markLabOrderDelivered(orderId: string, input: MarkLabDateInput): Promise<ActionResult<null>> {
  return setLabDate(orderId, "delivered_at", input);
}

/** Borra un pedido. Owner/manager. */
export async function deleteLabOrder(orderId: string): Promise<ActionResult<null>> {
  const access = await assertLabAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("lab_order")
    .delete()
    .eq("id", orderId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/tests/unit/lab-order-actions.test.ts` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/lab-actions.ts" src/tests/unit/lab-order-actions.test.ts
git commit -m "feat(ortodoncia): server actions pedidos de laboratorio"
```

---

### Task 6: Hooks React Query

**Files:**
- Create: `src/hooks/use-lab-orders.ts`

**Interfaces:**
- Consumes: `labOrderKeys`, `fetchLabOrders` (Task 4); actions (Task 5); `CreateLabOrderInput`, `MarkLabDateInput` (Task 2).
- Produces: `useLabOrders(salonId, customerId)`; `useCreateLabOrder(salonId, customerId)`; `useMarkLabOrderReceived(salonId, customerId)`; `useMarkLabOrderDelivered(salonId, customerId)`; `useDeleteLabOrder(salonId, customerId)`.

- [ ] **Step 1: Write the implementation** (patrón calcado de `src/hooks/use-ortho-payments.ts`)

```ts
// src/hooks/use-lab-orders.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createLabOrder,
  deleteLabOrder,
  markLabOrderDelivered,
  markLabOrderReceived,
} from "@/app/(dashboard)/ortodoncia/lab-actions";
import { fetchLabOrders, labOrderKeys } from "@/lib/queries/lab-orders";
import type { CreateLabOrderInput, MarkLabDateInput } from "@/lib/validations/lab-orders";

export function useLabOrders(salonId: string, customerId: string) {
  return useQuery({
    queryKey: labOrderKeys.list(salonId, customerId),
    queryFn: () => fetchLabOrders(salonId, customerId),
    enabled: customerId.length > 0,
  });
}

function useInvalidate(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: labOrderKeys.list(salonId, customerId) });
}

export function useCreateLabOrder(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (input: CreateLabOrderInput) => {
      const res = await createLabOrder(customerId, input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useMarkLabOrderReceived(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (vars: { orderId: string; input: MarkLabDateInput }) => {
      const res = await markLabOrderReceived(vars.orderId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useMarkLabOrderDelivered(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (vars: { orderId: string; input: MarkLabDateInput }) => {
      const res = await markLabOrderDelivered(vars.orderId, vars.input);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteLabOrder(salonId: string, customerId: string) {
  const invalidate = useInvalidate(salonId, customerId);
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await deleteLabOrder(orderId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-lab-orders.ts
git commit -m "feat(ortodoncia): hooks pedidos de laboratorio"
```

---

### Task 7: UI — tarjeta "Laboratorio" (con ui-ux-pro-max)

**Files:**
- Create: `src/components/dental/ortho-lab-card.tsx`

**Interfaces:**
- Consumes: hooks (Task 6); `LAB_ORDER_KIND_LABELS`, `LAB_ORDER_STATUS_LABELS`, `labOrderStatus`, `LabOrderKind` (Task 1); `LabOrder` (Task 3); primitivos UI (`Button`, `Input`, `Label`, `Card*`).
- Produces: componente `OrthoLabCard` con props `{ salonId: string; customerId: string }`.

> **OBLIGATORIO:** invoca `ui-ux-pro-max` antes de escribir el componente. Mantén el cableado (hooks/acciones) y eleva la presentación al nivel de `ortho-payment-plan-card.tsx` (Fase 2). RSC boundary: NO importes `@/lib/salon`. Reutiliza el manejo de errores por-mutación con estado local (patrón de `consent-list.tsx` / la card de pago).

- [ ] **Step 1: Implementar** (referencia funcional — elevar con ui-ux-pro-max; conserva nombres de hooks/props/campos)

```tsx
// src/components/dental/ortho-lab-card.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LAB_ORDER_KIND_LABELS,
  LAB_ORDER_STATUS_LABELS,
  labOrderStatus,
  type LabOrderKind,
} from "@/lib/dental/lab-orders";
import {
  useCreateLabOrder,
  useDeleteLabOrder,
  useLabOrders,
  useMarkLabOrderDelivered,
  useMarkLabOrderReceived,
} from "@/hooks/use-lab-orders";
import type { LabOrder } from "@/types/database";

export interface OrthoLabCardProps {
  salonId: string;
  customerId: string;
}

const KINDS: readonly LabOrderKind[] = ["modelo", "retenedor", "alineadores", "ortopedia", "otro"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrthoLabCard({ salonId, customerId }: OrthoLabCardProps): React.ReactElement {
  const ordersQuery = useLabOrders(salonId, customerId);
  const createOrder = useCreateLabOrder(salonId, customerId);
  const markReceived = useMarkLabOrderReceived(salonId, customerId);
  const markDelivered = useMarkLabOrderDelivered(salonId, customerId);
  const deleteOrder = useDeleteLabOrder(salonId, customerId);

  const [kind, setKind] = useState<LabOrderKind>("alineadores");
  const [labName, setLabName] = useState("");
  const [sentAt, setSentAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function submit(): void {
    setFormError(null);
    createOrder.mutate(
      { kind, labName: labName || null, sentAt, notes: notes || null },
      {
        onSuccess: () => {
          setLabName("");
          setNotes("");
        },
        onError: (e) => setFormError(e instanceof Error ? e.message : "No se pudo crear el pedido"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laboratorio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Nuevo pedido */}
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lab-kind">Tipo</Label>
            <select
              id="lab-kind"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as LabOrderKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{LAB_ORDER_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-name">Laboratorio</Label>
            <Input id="lab-name" value={labName} onChange={(e) => setLabName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-sent">Fecha de envío</Label>
            <Input id="lab-sent" type="date" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-notes">Notas</Label>
            <Input id="lab-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {formError !== null && (
            <p className="text-sm text-destructive sm:col-span-2">{formError}</p>
          )}
          <div className="sm:col-span-2">
            <Button onClick={submit} disabled={createOrder.isPending || sentAt.trim() === ""}>
              {createOrder.isPending ? "Creando…" : "Nuevo pedido"}
            </Button>
          </div>
        </div>

        {/* Lista */}
        {ordersQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pedidos de laboratorio.</p>
        ) : (
          <ul className="space-y-3">
            {(ordersQuery.data ?? []).map((o: LabOrder) => {
              const status = labOrderStatus({
                sentAt: o.sent_at,
                receivedAt: o.received_at,
                deliveredAt: o.delivered_at,
              });
              return (
                <li key={o.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {LAB_ORDER_KIND_LABELS[o.kind]}{o.lab_name ? ` · ${o.lab_name}` : ""}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {LAB_ORDER_STATUS_LABELS[status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Enviado {o.sent_at}
                    {o.received_at ? ` · Recibido ${o.received_at}` : ""}
                    {o.delivered_at ? ` · Entregado ${o.delivered_at}` : ""}
                  </p>
                  {o.notes && <p className="mt-1 whitespace-pre-wrap">{o.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status === "enviado" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markReceived.isPending}
                        onClick={() => markReceived.mutate({ orderId: o.id, input: { date: todayIso() } })}
                      >
                        Marcar recibido
                      </Button>
                    )}
                    {status === "recibido" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markDelivered.isPending}
                        onClick={() => markDelivered.mutate({ orderId: o.id, input: { date: todayIso() } })}
                      >
                        Marcar entregado
                      </Button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-destructive hover:underline"
                      onClick={() => deleteOrder.mutate(o.id)}
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Verificación visual** — `npm run dev`, `/ortodoncia`, paciente: (tras Task 8, que monta la pestaña) crear un pedido, marcar recibido → entregado, borrar.
- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortho-lab-card.tsx
git commit -m "feat(ortodoncia): UI tarjeta Laboratorio (ui-ux-pro-max)"
```

---

### Task 8: `/ortodoncia` — pestaña "Laboratorio" + bloque de alineadores en "Ficha y tratamiento" (ui-ux-pro-max)

**Files:**
- Modify: `src/components/dental/ortodoncia-view.tsx`

**Interfaces:**
- Consumes: `OrthoLabCard` (Task 7); `computeAlignerProgress` de `@/lib/dental/lab-orders` (Task 1); `visitsQuery` (ya presente en el view para el seguimiento); `treatment.alignerTotal` (Task 1/2); `PillTabs`/`ORTHO_TABS` (Fase 3).

> **OBLIGATORIO:** invoca `ui-ux-pro-max`. NO cambies la lógica de guardado existente: `alignerTotal` es un campo más del `treatment`, ya cubierto por el botón "Guardar ficha y tratamiento" (`useSaveOrthoData`). Antes de editar, LEE el archivo para confirmar: (a) la estructura real de `ORTHO_TABS` y cómo se renderiza cada tab; (b) el estado `treatment`/`setTreatment` y el helper `numberOrNull` (o equivalente); (c) el nombre real de `visitsQuery` y la forma de `v.actions`; (d) el nombre del campo `applianceType` en `OrthoTreatment`. Ajusta los identificadores a los reales.

- [ ] **Step 1: Añadir la pestaña "Laboratorio"**

1. Import: `import { OrthoLabCard } from "@/components/dental/ortho-lab-card";` y `import { computeAlignerProgress } from "@/lib/dental/lab-orders";`.
2. Añadir a `ORTHO_TABS` (tras la de radiografías): `{ id: "laboratorio", label: "Laboratorio" }`.
3. Añadir la rama de contenido: cuando el tab activo sea `"laboratorio"`, renderizar `<OrthoLabCard salonId={salonId} customerId={customerId} />` (usando el mismo mecanismo condicional que las demás tabs del archivo).

- [ ] **Step 2: Añadir el bloque de alineadores en la pestaña "Ficha y tratamiento"**

Dentro de la Card "Tratamiento" (tab "ficha"), cuando `treatment.applianceType === "alineadores"`:
1. Input del total (usa el mismo `numberOrNull`/setter del archivo):
```tsx
{treatment.applianceType === "alineadores" && (
  <div className="space-y-1.5">
    <Label htmlFor="alignerTotal">Nº total de alineadores</Label>
    <Input
      id="alignerTotal"
      type="number"
      min={1}
      value={treatment.alignerTotal ?? ""}
      onChange={(e) =>
        setTreatment((t) => ({ ...t, alignerTotal: numberOrNull(e.target.value) }))
      }
    />
  </div>
)}
```
2. Resumen de progreso (derivado de las visitas ya cargadas):
```tsx
{treatment.applianceType === "alineadores" && treatment.alignerTotal !== null && (() => {
  const progress = computeAlignerProgress(
    treatment.alignerTotal,
    (visitsQuery.data ?? []).map(
      (v) => (v.actions as { alignerDelivered?: number | null }).alignerDelivered ?? null,
    ),
  );
  return (
    <p className="text-sm text-muted-foreground sm:col-span-2">
      Alineadores: <strong>{progress.delivered}</strong> de {progress.total} entregados ·{" "}
      {progress.pending} pendientes
    </p>
  );
})()}
```
(El `alignerTotal` se persiste con el botón "Guardar ficha y tratamiento" existente — `saveOrthoData` ya serializa todo el objeto `treatment`, sin cambios.)

- [ ] **Step 3: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0.
Run: `npm run dev` → `/ortodoncia`: la pestaña "Laboratorio" funciona; en "Ficha y tratamiento" con aparatología = alineadores aparecen el input de total + el resumen (entregados según las visitas registradas), y persiste al guardar.

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): pestana Laboratorio + progreso de alineadores"
```

---

### Task 9: Verificación integral + despliegue

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 2: Suite completa** — `npx vitest run` → todo verde (previos + nuevos de laboratorio).
- [ ] **Step 3: Build** — `npm run build` → exit 0; `/ortodoncia` presente.
- [ ] **Step 4: Migración aplicada** — confirmar `lab_order` existe (REST 200) antes de desplegar; si no, pedírselo al usuario y esperar.
- [ ] **Step 5: Deploy** — `node scratchpad/deploy_kairos.js` → esperar READY → verificar en `https://kairosmanager.app` (pestaña Laboratorio: crear/recibir/entregar/borrar; en Ficha y tratamiento con alineadores el total + resumen).

---

## Self-Review (cobertura del spec)

- **A) Pedidos a laboratorio** (spec §3) → Tasks 1 (status), 2 (Zod), 3 (tabla), 4 (query), 5 (actions), 6 (hooks), 7 (UI), 8 (pestaña). ✔
- **Estado derivado de fechas** (spec §3.1/§3) → `labOrderStatus` Task 1; usado en Task 7. ✔
- **Server actions con gates** (spec §3.2) → crear/recibir/entregar owner/manager/staff; borrar owner/manager (Task 5). ✔
- **Lectura** (spec §3.3) → `fetchLabOrders` + `labOrderKeys` orden `sent_at desc` (Task 4). ✔
- **Pestaña "Laboratorio"** (spec §3.4) → `OrthoLabCard` (Task 7) + montada en PillTabs (Task 8). ✔
- **B) Trazabilidad alineadores** (spec §4) → `alignerTotal` en treatment (Tasks 1,2); `computeAlignerProgress` (Task 1); UI total + resumen en Ficha y tratamiento (Task 8). ✔
- **Sin migración para alignerTotal** (spec §4,§5) → JSONB; solo `lab_order` migra (Task 3). ✔
- **TDD + tsc 0 + suite + deploy** (spec §5,§6) → tests Tasks 1,2,5; verificación Task 9. ✔
- **Fuera de alcance** (spec §2): stock materiales, API labs, STL/DICOM, cefalometría, post-ajuste, TPV — NO incluidos. ✔

**Consistencia de tipos:** `LabOrderKind`/`labOrderStatus`/`computeAlignerProgress` (Task 1) usados en Tasks 5,7,8; `createLabOrderSchema`/`markLabDateSchema` + `CreateLabOrderInput`/`MarkLabDateInput` (Task 2) en Tasks 5,6; `LabOrder` (Task 3) en Tasks 4,5,7; `labOrderKeys.list(salonId, customerId)` idéntico Tasks 4,6; nombres de acciones (`createLabOrder`/`markLabOrderReceived`/`markLabOrderDelivered`/`deleteLabOrder`) idénticos Tasks 5,6; hooks (`useLabOrders`/`useCreateLabOrder`/`useMarkLabOrderReceived`/`useMarkLabOrderDelivered`/`useDeleteLabOrder`) Task 6 → Task 7; `alignerTotal` en `OrthoTreatment` (Task 1) + Zod (Task 2) + UI (Task 8).
