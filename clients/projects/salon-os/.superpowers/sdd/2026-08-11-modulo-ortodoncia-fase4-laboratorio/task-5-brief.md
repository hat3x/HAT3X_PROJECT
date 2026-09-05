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

