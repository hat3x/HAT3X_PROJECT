### Task 5: Server actions (merge JSONB + visitas)

**Files:**
- Create: `src/app/(dashboard)/ortodoncia/actions.ts`
- Test: `src/tests/unit/ortho-actions.test.ts`

**Interfaces:**
- Consumes: `orthoDataSchema`, `OrthoDataInput`, `orthoVisitSchema`, `OrthoVisitInput` (Task 2); `OrthoVisit`, `Json`, `MemberRole` (types).
- Produces: `ActionResult<T>`; `saveOrthoData(customerId, input): Promise<ActionResult<null>>`; `addOrthoVisit(customerId, input): Promise<ActionResult<OrthoVisit>>`; `deleteOrthoVisit(visitId): Promise<ActionResult<null>>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/ortho-actions.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, getUserMock } =
  vi.hoisted(() => ({
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
  createClient: () => ({
    from: (table: string) => fromMock(table),
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveOrthoData } from "@/app/(dashboard)/ortodoncia/actions";

function asRole(role: MemberRole) {
  return { role };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("saveOrthoData", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("rechaza a staff (ficha es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("staff"));
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("hace merge preservando otras claves de data", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("owner"));

    let upsertPayload: Record<string, unknown> | null = null;
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("clinical_records");
      return {
        // read chain: .select().eq().eq().maybeSingle()
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { data: { last_xray_at: "2026-01-01", ortho: { ficha: {} } } },
                error: null,
              }),
            }),
          }),
        }),
        // write chain: .upsert()
        upsert: (payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return Promise.resolve({ error: null });
        },
      };
    });

    const res = await saveOrthoData("c1", {
      ficha: { malocclusionClass: "I" },
      treatment: { status: "activo" },
    });

    expect(res.ok).toBe(true);
    const written = upsertPayload as { data: Record<string, unknown> };
    expect(written.data.last_xray_at).toBe("2026-01-01"); // clave ajena preservada
    expect(
      (written.data.ortho as { ficha: { malocclusionClass: string } }).ficha.malocclusionClass,
    ).toBe("I");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/unit/ortho-actions.test.ts`
Expected: FAIL — cannot find module `@/app/(dashboard)/ortodoncia/actions`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/(dashboard)/ortodoncia/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  orthoDataSchema,
  orthoVisitSchema,
  type OrthoDataInput,
  type OrthoVisitInput,
} from "@/lib/validations/ortho";
import type { Json, MemberRole, OrthoVisit } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

// clinical_records restringe INSERT/UPDATE a owner/manager por RLS; ortho_visit permite staff.
const FICHA_ROLES: readonly MemberRole[] = ["owner", "manager"];
const VISIT_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

async function assertOrthoAccess(
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

/**
 * Guarda ficha + tratamiento ortho haciendo MERGE sobre clinical_records.data:
 * lee el data actual, reemplaza SOLO el sub-árbol `ortho`, y reescribe. Preserva
 * cualquier otra clave de `data`. Upsert por customer_id (crea la ficha si no existe).
 */
export async function saveOrthoData(
  customerId: string,
  input: OrthoDataInput,
): Promise<ActionResult<null>> {
  const parsed = orthoDataSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(FICHA_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: current, error: readErr } = await supabase
    .from("clinical_records")
    .select("data")
    .eq("customer_id", customerId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };

  const existing = (current?.data ?? {}) as Record<string, unknown>;
  const nextData = { ...existing, ortho: parsed.data } as Json;

  const { error } = await supabase
    .from("clinical_records")
    .upsert(
      { customer_id: customerId, salon_id: access.salonId, data: nextData },
      { onConflict: "customer_id" },
    );
  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Añade una entrada al timeline de visitas ortho. */
export async function addOrthoVisit(
  customerId: string,
  input: OrthoVisitInput,
): Promise<ActionResult<OrthoVisit>> {
  const parsed = orthoVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("ortho_visit")
    .insert({
      salon_id: access.salonId,
      customer_id: customerId,
      appointment_id: parsed.data.appointmentId,
      visit_date: parsed.data.visitDate,
      actions: parsed.data.actions as Json,
      notes: parsed.data.notes,
      next_step: parsed.data.nextStep,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data };
}

/** Borra una visita del timeline (owner/manager/staff, acotado por salón). */
export async function deleteOrthoVisit(visitId: string): Promise<ActionResult<null>> {
  const access = await assertOrthoAccess(VISIT_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("ortho_visit")
    .delete()
    .eq("id", visitId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/unit/ortho-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ortodoncia/actions.ts" src/tests/unit/ortho-actions.test.ts
git commit -m "feat(ortodoncia): server actions (merge data + visitas)"
```

---

