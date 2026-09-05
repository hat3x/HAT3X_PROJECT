/**
 * Server actions del PERIODONTOGRAMA (`app/(dashboard)/periodontograma/actions`).
 *
 * A diferencia de `odontograma/actions.ts` (que delega el gate de sector al
 * layout `SectorGate` + RLS), estas acciones añaden un gate EXPLÍCITO en
 * servidor — defensa en profundidad pedida por el brief — porque la política
 * RLS `managers_insert_perio_exam` permite a cualquier owner/manager insertar
 * SIN comprobar el sector (solo `dental_staff_insert_perio_exam` exige
 * sector=odontologia). Sin este gate de app, un owner/manager de un salón de
 * peluquería podría escribir en el periodontograma vía Server Action.
 *
 * Se mockea `@/lib/salon` (getActiveSalon + getActiveMembership) y
 * `@/lib/supabase/server` (mismo patrón que `facturas-delete-action.test.ts`).
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
  createPerioExam,
  savePerioMeasurements,
  signPerioExam,
} from "@/app/(dashboard)/periodontograma/actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const EXAM_ID = "22222222-2222-2222-2222-222222222222";

/** Fila de perio_exam de ejemplo, tal y como la devolvería Supabase. */
const EXAM_ROW = {
  id: EXAM_ID,
  salon_id: SALON_ID,
  customer_id: CUSTOMER_ID,
  examiner_id: null,
  notes: null,
  signed: false,
  signed_at: null,
  signed_by: null,
  created_by: null,
  created_at: "2026-07-31T10:00:00.000Z",
  updated_at: "2026-07-31T10:00:00.000Z",
};

function salon(sector: SalonSector): void {
  getActiveSalonMock.mockResolvedValue({
    id: SALON_ID,
    name: "Salón de prueba",
    slug: "salon-prueba",
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
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.in = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// ---------------------------------------------------------------------------
// Gate compartido — se comprueba en las 3 acciones
// ---------------------------------------------------------------------------

describe("gate de escritura del periodontograma", () => {
  it("(a) sector peluquería ⇒ createPerioExam devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await createPerioExam({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ savePerioMeasurements devuelve { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await savePerioMeasurements(EXAM_ID, [], []);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ signPerioExam devuelve { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await signPerioExam(EXAM_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(b) sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await createPerioExam({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("(b) sector odontología pero sin membresía activa (sin rol de escritura) ⇒ rechazo", async () => {
    salon("odontologia");
    getActiveMembershipMock.mockResolvedValue(null);

    const result = await createPerioExam({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createPerioExam — éxito
// ---------------------------------------------------------------------------

describe("createPerioExam", () => {
  it("sector odontología + rol de escritura ⇒ crea el examen en borrador", async () => {
    salon("odontologia");
    membership("staff");
    fromMock.mockImplementation((table: string) => {
      if (table === "perio_exam") return chain({ data: EXAM_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createPerioExam({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: true, data: EXAM_ROW });
    expect(fromMock).toHaveBeenCalledWith("perio_exam");
  });

  it("opaca un error de BD devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await createPerioExam({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// savePerioMeasurements — éxito (mapea fdi_tooth → tooth_id al insertar sitios)
// ---------------------------------------------------------------------------

describe("savePerioMeasurements", () => {
  it("inserta perio_tooth y luego perio_site resolviendo tooth_id por fdi_tooth", async () => {
    salon("odontologia");
    membership("manager");

    const insertedTooth = {
      id: "tooth-11",
      exam_id: EXAM_ID,
      salon_id: SALON_ID,
      fdi_tooth: 11,
      mobility: 0,
      furcation: 0,
      plaque: false,
      created_at: "2026-07-31T10:00:00.000Z",
    };
    const insertedSite = {
      id: "site-1",
      tooth_id: "tooth-11",
      salon_id: SALON_ID,
      site: 1,
      pd_mm: 3,
      gingival_margin_mm: 0,
      cal_mm: 3,
      bop: false,
      suppuration: false,
      plaque: false,
      created_at: "2026-07-31T10:00:00.000Z",
    };

    fromMock.mockImplementation((table: string) => {
      if (table === "perio_tooth") return chain({ data: [insertedTooth], error: null });
      if (table === "perio_site") return chain({ data: [insertedSite], error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await savePerioMeasurements(
      EXAM_ID,
      [{ fdi_tooth: 11, mobility: 0, furcation: 0, plaque: false }],
      [{ fdi_tooth: 11, site: 1, pd_mm: 3, gingival_margin_mm: 0, bop: false }],
    );

    expect(result).toEqual({
      ok: true,
      data: { teeth: [insertedTooth], sites: [insertedSite] },
    });
  });

  it("sin sitios, no llama a perio_site", async () => {
    salon("odontologia");
    membership("owner");

    const insertedTooth = {
      id: "tooth-11",
      exam_id: EXAM_ID,
      salon_id: SALON_ID,
      fdi_tooth: 11,
      mobility: 0,
      furcation: 0,
      plaque: false,
      created_at: "2026-07-31T10:00:00.000Z",
    };

    fromMock.mockImplementation((table: string) => {
      if (table === "perio_tooth") return chain({ data: [insertedTooth], error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await savePerioMeasurements(
      EXAM_ID,
      [{ fdi_tooth: 11, mobility: 0, furcation: 0, plaque: false }],
      [],
    );

    expect(result).toEqual({ ok: true, data: { teeth: [insertedTooth], sites: [] } });
    expect(fromMock).not.toHaveBeenCalledWith("perio_site");
  });

  it("un sitio que referencia un fdi_tooth no guardado ⇒ { ok:false }", async () => {
    salon("odontologia");
    membership("owner");

    fromMock.mockImplementation((table: string) => {
      if (table === "perio_tooth") return chain({ data: [], error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await savePerioMeasurements(
      EXAM_ID,
      [],
      [{ fdi_tooth: 99, site: 1, pd_mm: 3, gingival_margin_mm: 0, bop: false }],
    );

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signPerioExam — éxito
// ---------------------------------------------------------------------------

describe("signPerioExam", () => {
  it("sector odontología + rol de escritura ⇒ firma el examen", async () => {
    salon("odontologia");
    membership("owner");
    const signedRow = { ...EXAM_ROW, signed: true, signed_by: "user-1" };
    fromMock.mockImplementation((table: string) => {
      if (table === "perio_exam") return chain({ data: signedRow, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await signPerioExam(EXAM_ID);

    expect(result).toEqual({ ok: true, data: signedRow });
  });
});
