/**
 * Server actions de SEGURO/MUTUA DEL PACIENTE (`app/(dashboard)/customers/insurance-actions`).
 *
 * Mismo patrón de mock que `planes-actions.test.ts`: se mockea `@/lib/salon`
 * (getActiveSalon + getActiveMembership) y `@/lib/supabase/server`
 * (createClient().from(...)). El gate admite `staff` (igual que
 * `planes/actions.ts`), a diferencia de `mutuas-actions.test.ts`
 * (`ajustes/mutuas/actions.ts`, solo owner/manager).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole, SalonSector } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock } = vi.hoisted(() => ({
  getActiveSalonMock: vi.fn(),
  getActiveMembershipMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addCustomerInsurance, removeCustomerInsurance } from "@/app/(dashboard)/customers/insurance-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const INSURER_ID = "22222222-2222-2222-2222-222222222222";
const INSURANCE_ID = "33333333-3333-3333-3333-333333333333";

const INSURANCE_ROW = {
  id: INSURANCE_ID,
  salon_id: SALON_ID,
  customer_id: CUSTOMER_ID,
  insurer_id: INSURER_ID,
  policy_number: "POL-123",
  notes: null,
  created_at: "2026-08-01T10:00:00.000Z",
};

function salon(sector: SalonSector): void {
  getActiveSalonMock.mockResolvedValue({
    id: SALON_ID,
    name: "Clínica de prueba",
    slug: "clinica-prueba",
    timezone: "Europe/Madrid",
    sector,
  });
}

function membership(role: MemberRole): void {
  getActiveMembershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

/** Chain de Supabase encadenable y "then-able": resuelve `result` sin importar qué se encadene. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Gate — sector peluquería ⇒ rechazo, sin tocar la BD
// ---------------------------------------------------------------------------

describe("gate de escritura del seguro del paciente", () => {
  it("sector peluquería ⇒ addCustomerInsurance devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await addCustomerInsurance({ customerId: CUSTOMER_ID, insurerId: INSURER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await addCustomerInsurance({ customerId: CUSTOMER_ID, insurerId: INSURER_ID });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("sector odontología pero sin membresía activa ⇒ rechazo", async () => {
    salon("odontologia");
    getActiveMembershipMock.mockResolvedValue(null);

    const result = await addCustomerInsurance({ customerId: CUSTOMER_ID, insurerId: INSURER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("removeCustomerInsurance: sector peluquería ⇒ { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await removeCustomerInsurance(INSURANCE_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addCustomerInsurance — éxito (staff incluido: flujo clínico normal)
// ---------------------------------------------------------------------------

describe("addCustomerInsurance", () => {
  it("sector odontología + rol staff ⇒ asigna la aseguradora al paciente", async () => {
    salon("odontologia");
    membership("staff");
    fromMock.mockImplementation((table: string) => {
      if (table === "customer_insurance") return chain({ data: INSURANCE_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addCustomerInsurance({
      customerId: CUSTOMER_ID,
      insurerId: INSURER_ID,
      policyNumber: "POL-123",
    });

    expect(result).toEqual({ ok: true, data: INSURANCE_ROW });
    expect(fromMock).toHaveBeenCalledWith("customer_insurance");
  });

  it("policyNumber vacío ⇒ se normaliza a null", async () => {
    salon("odontologia");
    membership("owner");

    let insertedPayload: Record<string, unknown> | undefined;
    fromMock.mockImplementation((table: string) => {
      if (table === "customer_insurance") {
        const c: Record<string, unknown> = {};
        c.insert = vi.fn((payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return c;
        });
        c.select = vi.fn(() => c);
        c.single = vi.fn(async () => ({ data: INSURANCE_ROW, error: null }));
        return c;
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    await addCustomerInsurance({ customerId: CUSTOMER_ID, insurerId: INSURER_ID, policyNumber: "   " });

    expect(insertedPayload).toMatchObject({ policy_number: null });
  });

  it("opaca un error de BD (p. ej. FK a clinical_records) devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() =>
      chain({ data: null, error: { message: "violates foreign key constraint" } }),
    );

    const result = await addCustomerInsurance({ customerId: CUSTOMER_ID, insurerId: INSURER_ID });

    expect(result).toEqual({ ok: false, error: "violates foreign key constraint" });
  });
});

// ---------------------------------------------------------------------------
// removeCustomerInsurance
// ---------------------------------------------------------------------------

describe("removeCustomerInsurance", () => {
  it("sector odontología + rol manager ⇒ quita la póliza", async () => {
    salon("odontologia");
    membership("manager");
    fromMock.mockImplementation((table: string) => {
      if (table === "customer_insurance") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await removeCustomerInsurance(INSURANCE_ID);

    expect(result).toEqual({ ok: true, data: { id: INSURANCE_ID } });
  });
});
