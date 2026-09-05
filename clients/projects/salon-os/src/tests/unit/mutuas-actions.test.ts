/**
 * Server actions de MUTUAS Y SEGUROS (`app/(dashboard)/ajustes/mutuas/actions`).
 *
 * Mismo patrón de mock que `planes-actions.test.ts`: se mockea `@/lib/salon`
 * (getActiveSalon + getActiveMembership) y `@/lib/supabase/server`
 * (createClient().from(...)), sin auth.getUser() porque `insurer`/
 * `insurer_service_price` no llevan columna `created_by`.
 *
 * A diferencia de `planes/actions.ts` (que admite `staff`), este gate exige
 * owner/manager — `staff` debe rechazarse igual que peluquería.
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

import {
  createInsurer,
  deleteInsurer,
  removeInsurerServicePrice,
  setInsurerServicePrice,
  updateInsurer,
} from "@/app/(dashboard)/ajustes/mutuas/actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const INSURER_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const PRICE_ID = "33333333-3333-3333-3333-333333333333";

const INSURER_ROW = {
  id: INSURER_ID,
  salon_id: SALON_ID,
  name: "Sanitas",
  phone: null,
  email: null,
  notes: null,
  active: true,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
};

const PRICE_ROW = {
  id: PRICE_ID,
  salon_id: SALON_ID,
  insurer_id: INSURER_ID,
  service_id: SERVICE_ID,
  price_cents: 3000,
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
  c.update = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.upsert = vi.fn(() => c);
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
// Gate — sector peluquería y rol staff ⇒ rechazo, sin tocar la BD
// ---------------------------------------------------------------------------

describe("gate de escritura de mutuas y seguros", () => {
  it("sector peluquería ⇒ createInsurer devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await createInsurer({ name: "Sanitas" });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rol staff (sin permiso, solo owner/manager) ⇒ createInsurer devuelve { ok:false }", async () => {
    salon("odontologia");
    membership("staff");

    const result = await createInsurer({ name: "Sanitas" });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await createInsurer({ name: "Sanitas" });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("setInsurerServicePrice: sector peluquería ⇒ { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await setInsurerServicePrice({
      insurerId: INSURER_ID,
      serviceId: SERVICE_ID,
      priceCents: 3000,
    });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("deleteInsurer: rol staff ⇒ { ok:false }", async () => {
    salon("odontologia");
    membership("staff");

    const result = await deleteInsurer(INSURER_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createInsurer — éxito
// ---------------------------------------------------------------------------

describe("createInsurer", () => {
  it("sector odontología + owner ⇒ crea la aseguradora", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer") return chain({ data: INSURER_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createInsurer({ name: "Sanitas" });

    expect(result).toEqual({ ok: true, data: INSURER_ROW });
    expect(fromMock).toHaveBeenCalledWith("insurer");
  });

  it("manager también puede crear (no solo owner)", async () => {
    salon("odontologia");
    membership("manager");
    fromMock.mockImplementation(() => chain({ data: INSURER_ROW, error: null }));

    const result = await createInsurer({ name: "Sanitas" });

    expect(result.ok).toBe(true);
  });

  it("nombre vacío ⇒ { ok:false } sin tocar la BD", async () => {
    salon("odontologia");
    membership("owner");

    const result = await createInsurer({ name: "   " });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("opaca un error de BD devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await createInsurer({ name: "Sanitas" });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// updateInsurer / deleteInsurer
// ---------------------------------------------------------------------------

describe("updateInsurer / deleteInsurer", () => {
  it("updateInsurer: actualiza la aseguradora", async () => {
    salon("odontologia");
    membership("manager");
    const updated = { ...INSURER_ROW, name: "Sanitas SA" };
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer") return chain({ data: updated, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await updateInsurer(INSURER_ID, { name: "Sanitas SA" });

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("deleteInsurer: owner ⇒ borra la aseguradora", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deleteInsurer(INSURER_ID);

    expect(result).toEqual({ ok: true, data: { id: INSURER_ID } });
  });
});

// ---------------------------------------------------------------------------
// setInsurerServicePrice / removeInsurerServicePrice — baremo
// ---------------------------------------------------------------------------

describe("setInsurerServicePrice", () => {
  it("fija el precio del servicio en el baremo (upsert)", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer_service_price") return chain({ data: PRICE_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await setInsurerServicePrice({
      insurerId: INSURER_ID,
      serviceId: SERVICE_ID,
      priceCents: 3000,
    });

    expect(result).toEqual({ ok: true, data: PRICE_ROW });
    expect(fromMock).toHaveBeenCalledWith("insurer_service_price");
  });

  it("precio negativo ⇒ { ok:false } sin tocar la BD", async () => {
    salon("odontologia");
    membership("owner");

    const result = await setInsurerServicePrice({
      insurerId: INSURER_ID,
      serviceId: SERVICE_ID,
      priceCents: -100,
    });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("precio no entero ⇒ { ok:false } sin tocar la BD", async () => {
    salon("odontologia");
    membership("owner");

    const result = await setInsurerServicePrice({
      insurerId: INSURER_ID,
      serviceId: SERVICE_ID,
      priceCents: 30.5,
    });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("removeInsurerServicePrice", () => {
  it("quita una línea del baremo", async () => {
    salon("odontologia");
    membership("manager");
    fromMock.mockImplementation((table: string) => {
      if (table === "insurer_service_price") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await removeInsurerServicePrice(PRICE_ID);

    expect(result).toEqual({ ok: true, data: { id: PRICE_ID } });
  });
});
