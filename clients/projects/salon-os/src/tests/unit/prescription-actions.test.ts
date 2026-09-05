/**
 * Server actions de RECETAS (`app/(dashboard)/expediente/prescription-actions`).
 *
 * Mismo patrón que `expediente-actions.test.ts`: gate explícito de sector
 * (odontologia) + rol en servidor, ADICIONAL a RLS, se mockea `@/lib/salon`
 * (getActiveSalon + getActiveMembership) y `@/lib/supabase/server`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole, SalonSector } from "@/types/database";

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
  createClient: () => ({
    from: (table: string) => fromMock(table),
    auth: { getUser: () => getUserMock() },
  }),
}));

import {
  addPrescriptionItem,
  createPrescription,
  deletePrescription,
  issuePrescription,
  revokePrescription,
} from "@/app/(dashboard)/expediente/prescription-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PRESCRIPTION_ID = "22222222-2222-2222-2222-222222222222";

function prescriptionRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: PRESCRIPTION_ID,
    salon_id: SALON_ID,
    customer_id: CUSTOMER_ID,
    prescriber_id: null,
    prescriber_name: "Dra. Ana Ruiz",
    diagnosis: "Pulpitis irreversible 26",
    notes: null,
    status: "draft",
    issued_at: null,
    signed_by: null,
    revoked_at: null,
    created_by: "user-1",
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

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

/**
 * Chain de Supabase encadenable y "then-able": resuelve `result` sin importar
 * qué se encadene (`.select().eq().eq()` sin `.single()` resuelve `result`
 * directamente vía `.then`, como hace el conteo `{count, head:true}` real).
 */
function chain(result: {
  data?: unknown;
  error: unknown;
  count?: number | null;
}): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.in = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

/**
 * Configura `fromMock` para devolver, por tabla, una secuencia de resultados
 * (consumidos en orden de llamada; se repite el último si se agotan). Permite
 * simular la misma tabla devolviendo filas distintas en llamadas sucesivas
 * (p.ej. `prescription`: primero el fetch del estado actual, luego el UPDATE;
 * o `prescription_item`: primero el conteo, luego el INSERT).
 */
function fromSequence(
  results: Record<string, Array<{ data?: unknown; error: unknown; count?: number | null }>>,
): (table: string) => Record<string, unknown> {
  const counters: Record<string, number> = {};
  return (table: string) => {
    const list = results[table];
    if (list === undefined || list.length === 0) {
      throw new Error(`tabla inesperada: ${table}`);
    }
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const result = list[Math.min(idx, list.length - 1)] as {
      data?: unknown;
      error: unknown;
      count?: number | null;
    };
    return chain(result);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// ---------------------------------------------------------------------------
// Gate compartido — sector peluquería ⇒ rechazo, sin tocar la BD
// ---------------------------------------------------------------------------

describe("gate de escritura de recetas", () => {
  it("sector peluquería ⇒ createPrescription devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await createPrescription({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sector peluquería ⇒ addPrescriptionItem devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await addPrescriptionItem({
      prescriptionId: PRESCRIPTION_ID,
      medication: "Amoxicilina 500 mg",
    });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sector peluquería ⇒ issuePrescription devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await issuePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await createPrescription({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("deletePrescription: rol staff (sin permiso de borrado) ⇒ { ok:false } sin tocar la BD", async () => {
    salon("odontologia");
    membership("staff");

    const result = await deletePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createPrescription
// ---------------------------------------------------------------------------

describe("createPrescription", () => {
  it("crea la cabecera en estado 'draft', con los campos opcionales a null si faltan", async () => {
    salon("odontologia");
    membership("staff");

    const prescriptionsChain = chain({
      data: prescriptionRow({ prescriber_name: null, diagnosis: null }),
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return prescriptionsChain;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createPrescription({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(true);
    const insertMock = prescriptionsChain.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.status).toBe("draft");
    expect(payload.prescriber_name).toBeNull();
    expect(payload.diagnosis).toBeNull();
    expect(payload.notes).toBeNull();
    expect(payload.created_by).toBe("user-1");
  });

  it("con prescriberName/diagnosis/notes ⇒ los usa tal cual", async () => {
    salon("odontologia");
    membership("owner");

    const prescriptionsChain = chain({ data: prescriptionRow(), error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return prescriptionsChain;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createPrescription({
      customerId: CUSTOMER_ID,
      prescriberName: "Dra. Ana Ruiz",
      diagnosis: "Pulpitis irreversible 26",
      notes: "Alergia a penicilina",
    });

    expect(result.ok).toBe(true);
    const insertMock = prescriptionsChain.insert as ReturnType<typeof vi.fn>;
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.prescriber_name).toBe("Dra. Ana Ruiz");
    expect(payload.diagnosis).toBe("Pulpitis irreversible 26");
    expect(payload.notes).toBe("Alergia a penicilina");
  });

  it("opaca un error de BD devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await createPrescription({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// addPrescriptionItem
// ---------------------------------------------------------------------------

describe("addPrescriptionItem", () => {
  it("calcula position a partir del recuento actual de renglones", async () => {
    salon("odontologia");
    membership("staff");

    const insertedItem = {
      id: "item-1",
      salon_id: SALON_ID,
      prescription_id: PRESCRIPTION_ID,
      position: 2,
      medication: "Ibuprofeno 600 mg",
      dose: "1 comprimido",
      frequency: "cada 8 h",
      duration: "5 días",
      quantity: null,
      instructions: null,
    };

    fromMock.mockImplementation(
      fromSequence({
        // 1ª llamada: el conteo ({count:2, error:null}, sin .single()).
        // 2ª llamada: el INSERT + .select().single().
        prescription_item: [
          { data: null, error: null, count: 2 },
          { data: insertedItem, error: null },
        ],
      }),
    );

    const result = await addPrescriptionItem({
      prescriptionId: PRESCRIPTION_ID,
      medication: "Ibuprofeno 600 mg",
      dose: "1 comprimido",
      frequency: "cada 8 h",
      duration: "5 días",
    });

    expect(result).toEqual({ ok: true, data: insertedItem });
  });

  it("payload del insert: position calculado + opcionales ausentes a null", async () => {
    salon("odontologia");
    membership("staff");

    let insertMock: ReturnType<typeof vi.fn> | undefined;
    let callCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "prescription_item") throw new Error(`tabla inesperada: ${table}`);
      callCount += 1;
      if (callCount === 1) return chain({ data: null, error: null, count: 3 });
      const c = chain({ data: { id: "item-2" }, error: null });
      insertMock = c.insert as ReturnType<typeof vi.fn>;
      return c;
    });

    await addPrescriptionItem({ prescriptionId: PRESCRIPTION_ID, medication: "Paracetamol 1 g" });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock?.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.position).toBe(3);
    expect(payload.medication).toBe("Paracetamol 1 g");
    expect(payload.dose).toBeNull();
    expect(payload.frequency).toBeNull();
    expect(payload.duration).toBeNull();
    expect(payload.quantity).toBeNull();
    expect(payload.instructions).toBeNull();
  });

  it("error al contar renglones ⇒ { ok:false } sin insertar", async () => {
    salon("odontologia");
    membership("staff");

    fromMock.mockImplementation((table: string) => {
      if (table === "prescription_item") {
        return chain({ data: null, error: { message: "count boom" }, count: null });
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addPrescriptionItem({
      prescriptionId: PRESCRIPTION_ID,
      medication: "Ibuprofeno 600 mg",
    });

    expect(result).toEqual({ ok: false, error: "count boom" });
  });
});

// ---------------------------------------------------------------------------
// issuePrescription / revokePrescription — respetan canIssue/canRevoke
// ---------------------------------------------------------------------------

describe("issuePrescription", () => {
  it("draft ⇒ emite: status 'issued', issued_at y signed_by", async () => {
    salon("odontologia");
    membership("staff");

    const existing = prescriptionRow({ status: "draft" });
    const updated = prescriptionRow({
      status: "issued",
      issued_at: "2026-08-01T12:00:00.000Z",
      signed_by: "user-1",
    });

    fromMock.mockImplementation(
      fromSequence({
        prescription: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await issuePrescription(PRESCRIPTION_ID);

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("issued ⇒ { ok:false }, no permite reemitir (canIssuePrescription)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = prescriptionRow({ status: "issued" });
    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await issuePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
  });

  it("revoked ⇒ { ok:false } (canIssuePrescription)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = prescriptionRow({ status: "revoked" });
    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await issuePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
  });
});

describe("revokePrescription", () => {
  it("issued ⇒ revoca: status 'revoked' y revoked_at", async () => {
    salon("odontologia");
    membership("owner");

    const existing = prescriptionRow({ status: "issued", issued_at: "2026-08-01T11:00:00.000Z" });
    const updated = prescriptionRow({
      status: "revoked",
      issued_at: "2026-08-01T11:00:00.000Z",
      revoked_at: "2026-08-01T13:00:00.000Z",
    });

    fromMock.mockImplementation(
      fromSequence({
        prescription: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await revokePrescription(PRESCRIPTION_ID);

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("draft ⇒ { ok:false }, no permite revocar sin emitir (canRevokePrescription)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = prescriptionRow({ status: "draft" });
    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await revokePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deletePrescription — solo 'draft' (owner/manager)
// ---------------------------------------------------------------------------

describe("deletePrescription", () => {
  it("draft + owner ⇒ borra la receta", async () => {
    salon("odontologia");
    membership("owner");

    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return chain({ data: { status: "draft" }, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deletePrescription(PRESCRIPTION_ID);

    expect(result).toEqual({ ok: true, data: { id: PRESCRIPTION_ID } });
  });

  it("issued ⇒ { ok:false } (inmutable, no se borra)", async () => {
    salon("odontologia");
    membership("manager");

    fromMock.mockImplementation((table: string) => {
      if (table === "prescription") return chain({ data: { status: "issued" }, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deletePrescription(PRESCRIPTION_ID);

    expect(result.ok).toBe(false);
  });
});
