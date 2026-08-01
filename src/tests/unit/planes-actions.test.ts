/**
 * Server actions de PLANES DE TRATAMIENTO (`app/(dashboard)/planes/actions`).
 *
 * Mismo patrón que `periodontograma/actions.ts` / `perio-actions.test.ts`:
 * gate explícito de sector (odontologia) + rol en servidor, ADICIONAL a RLS,
 * porque las políticas `treatment_plan_rw`/`plan_phase_rw`/`plan_item_rw`
 * acotan por `salon_id` pero no comprueban el sector del salón.
 *
 * `addPlanItem`/`transitionPlanItem` además reusan `addOdontogramFinding`
 * (`odontograma/actions.ts`) para materializar hallazgos — como ese módulo
 * también importa `createClient` de `@/lib/supabase/server`, comparte el
 * mismo `fromMock` mockeado aquí (llamada servidor-a-servidor normal, sin
 * cruzar ningún límite de red).
 *
 * Se mockea `@/lib/salon` (getActiveSalon + getActiveMembership) y
 * `@/lib/supabase/server` (mismo patrón que `perio-actions.test.ts`).
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
  addPlanItem,
  addPlanPhase,
  createPlan,
  deletePlan,
  deletePlanItem,
  transitionPlanItem,
  updatePlanStatus,
} from "@/app/(dashboard)/planes/actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PLAN_ID = "22222222-2222-2222-2222-222222222222";
const PHASE_ID = "33333333-3333-3333-3333-333333333333";
const ITEM_ID = "44444444-4444-4444-4444-444444444444";
const SERVICE_ID = "55555555-5555-5555-5555-555555555555";
const FINDING_ID = "66666666-6666-6666-6666-666666666666";
const PRODUCT_A_ID = "77777777-7777-7777-7777-777777777777";
const PRODUCT_B_ID = "88888888-8888-8888-8888-888888888888";

const PLAN_ROW = {
  id: PLAN_ID,
  salon_id: SALON_ID,
  customer_id: CUSTOMER_ID,
  status: "draft",
  currency: "EUR",
  notes: null,
  created_by: null,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
};

const PHASE_ROW = {
  id: PHASE_ID,
  salon_id: SALON_ID,
  plan_id: PLAN_ID,
  position: 0,
  name: "Fase 1 — Higiene",
  priority: 0,
  created_at: "2026-08-01T10:00:00.000Z",
};

function itemRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: ITEM_ID,
    salon_id: SALON_ID,
    plan_id: PLAN_ID,
    phase_id: null,
    position: 0,
    service_id: null,
    description: null,
    fdi_code: null,
    surfaces: [],
    quantity: 1,
    unit_price_cents: 5000,
    discount_cents: 0,
    tax_rate: 0,
    line_total_cents: 5000,
    state: "propuesto",
    scheduled_appointment_id: null,
    executed_at: null,
    executed_by: null,
    finding_id: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
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

/** Chain de Supabase encadenable y "then-able": resuelve `result` sin importar qué se encadene. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
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
 * (p.ej. `plan_item`: primero el fetch del estado actual, luego el UPDATE).
 */
function fromSequence(
  results: Record<string, Array<{ data: unknown; error: unknown }>>,
): (table: string) => Record<string, unknown> {
  const counters: Record<string, number> = {};
  return (table: string) => {
    const list = results[table];
    if (list === undefined || list.length === 0) {
      throw new Error(`tabla inesperada: ${table}`);
    }
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const result = list[Math.min(idx, list.length - 1)] as { data: unknown; error: unknown };
    return chain(result);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// ---------------------------------------------------------------------------
// (a) Gate compartido — sector peluquería ⇒ rechazo, sin tocar la BD
// ---------------------------------------------------------------------------

describe("gate de escritura de planes de tratamiento", () => {
  it("(a) sector peluquería ⇒ createPlan devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await createPlan({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ addPlanPhase devuelve { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await addPlanPhase({ planId: PLAN_ID, name: "Fase 1" });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ addPlanItem devuelve { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await addPlanItem({ planId: PLAN_ID, unitPriceCents: 1000 });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ transitionPlanItem devuelve { ok:false }", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await transitionPlanItem(ITEM_ID, "aceptado");

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await createPlan({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("sector odontología pero sin membresía activa ⇒ rechazo", async () => {
    salon("odontologia");
    getActiveMembershipMock.mockResolvedValue(null);

    const result = await createPlan({ customerId: CUSTOMER_ID });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("deletePlanItem: rol staff (sin permiso de borrado) ⇒ { ok:false }", async () => {
    salon("odontologia");
    membership("staff");

    const result = await deletePlanItem(ITEM_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createPlan — éxito
// ---------------------------------------------------------------------------

describe("createPlan", () => {
  it("sector odontología + rol de escritura ⇒ crea el plan en borrador", async () => {
    salon("odontologia");
    membership("staff");
    fromMock.mockImplementation((table: string) => {
      if (table === "treatment_plan") return chain({ data: PLAN_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createPlan({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: true, data: PLAN_ROW });
    expect(fromMock).toHaveBeenCalledWith("treatment_plan");
  });

  it("opaca un error de BD devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await createPlan({ customerId: CUSTOMER_ID });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// addPlanPhase — éxito
// ---------------------------------------------------------------------------

describe("addPlanPhase", () => {
  it("añade una fase al plan", async () => {
    salon("odontologia");
    membership("manager");
    fromMock.mockImplementation((table: string) => {
      if (table === "plan_phase") return chain({ data: PHASE_ROW, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addPlanPhase({ planId: PLAN_ID, name: "Fase 1 — Higiene" });

    expect(result).toEqual({ ok: true, data: PHASE_ROW });
  });
});

// ---------------------------------------------------------------------------
// addPlanItem — éxito
// ---------------------------------------------------------------------------

describe("addPlanItem", () => {
  it("sin fdiCode: inserta el item y NO toca odontogram_findings", async () => {
    salon("odontologia");
    membership("staff");
    const insertedItem = itemRow();

    fromMock.mockImplementation((table: string) => {
      if (table === "treatment_plan") {
        return chain({ data: { customer_id: CUSTOMER_ID }, error: null });
      }
      if (table === "plan_item") return chain({ data: insertedItem, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addPlanItem({ planId: PLAN_ID, unitPriceCents: 5000 });

    expect(result).toEqual({ ok: true, data: insertedItem });
    expect(fromMock).not.toHaveBeenCalledWith("odontogram_findings");
  });

  it("con fdiCode + serviceId de caries: materializa un odontogram_finding pendiente y guarda finding_id", async () => {
    salon("odontologia");
    membership("owner");

    const serviceRow = { name: "Obturación por caries", category: null };
    const findingRow = {
      id: FINDING_ID,
      clinical_record_id: CUSTOMER_ID,
      salon_id: SALON_ID,
      fdi_tooth: 11,
      surfaces: ["O"],
      finding_type: "caries",
      tooth_state: "pendiente",
      notes: null,
      recorded_by: "user-1",
      recorded_at: "2026-08-01T10:00:00.000Z",
      created_at: "2026-08-01T10:00:00.000Z",
    };
    const insertedItem = itemRow({ fdi_code: 11, surfaces: ["O"], finding_id: FINDING_ID });

    fromMock.mockImplementation((table: string) => {
      if (table === "treatment_plan") {
        return chain({ data: { customer_id: CUSTOMER_ID }, error: null });
      }
      if (table === "services") return chain({ data: serviceRow, error: null });
      if (table === "odontogram_findings") return chain({ data: findingRow, error: null });
      if (table === "plan_item") return chain({ data: insertedItem, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addPlanItem({
      planId: PLAN_ID,
      serviceId: SERVICE_ID,
      fdiCode: 11,
      surfaces: ["O"],
      unitPriceCents: 5000,
    });

    expect(result).toEqual({ ok: true, data: insertedItem });
    expect(fromMock).toHaveBeenCalledWith("odontogram_findings");
  });
});

// ---------------------------------------------------------------------------
// transitionPlanItem
// ---------------------------------------------------------------------------

describe("transitionPlanItem", () => {
  it("(b) transición inválida (propuesto → realizado) ⇒ { ok:false }, sin UPDATE", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "propuesto" });
    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result.ok).toBe(false);
  });

  it("(c) transición válida (propuesto → aceptado) ⇒ { ok:true }", async () => {
    salon("odontologia");
    membership("staff");

    const existing = itemRow({ state: "propuesto" });
    const updated = itemRow({ state: "aceptado" });

    fromMock.mockImplementation(
      fromSequence({
        plan_item: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await transitionPlanItem(ITEM_ID, "aceptado");

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("→ realizado con fdi_code: marca executed_at/executed_by y materializa un finding 'hecho'", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "en_curso", fdi_code: 21, service_id: SERVICE_ID });
    const updated = itemRow({
      state: "realizado",
      fdi_code: 21,
      service_id: SERVICE_ID,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });
    const serviceRow = { name: "Corona de porcelana", category: null };
    const findingRow = {
      id: FINDING_ID,
      clinical_record_id: CUSTOMER_ID,
      salon_id: SALON_ID,
      fdi_tooth: 21,
      surfaces: [],
      finding_type: "corona",
      tooth_state: "hecho",
      notes: null,
      recorded_by: "user-1",
      recorded_at: "2026-08-01T12:00:00.000Z",
      created_at: "2026-08-01T12:00:00.000Z",
    };

    fromMock.mockImplementation(
      fromSequence({
        plan_item: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
        treatment_plan: [{ data: { customer_id: CUSTOMER_ID }, error: null }],
        services: [{ data: serviceRow, error: null }],
        odontogram_findings: [{ data: findingRow, error: null }],
      }),
    );

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(fromMock).toHaveBeenCalledWith("odontogram_findings");
  });
});

// ---------------------------------------------------------------------------
// transitionPlanItem → auto-descuento de stock (escandallo, service_material)
// ---------------------------------------------------------------------------

describe("transitionPlanItem · auto-descuento de stock (escandallo)", () => {
  /**
   * Mock de `products` que resuelve el SELECT (id, stock) según el `id` del
   * `.eq("id", ...)` encadenado, y captura cada payload de `.update(...)` en
   * `productUpdates` (en orden de llamada — los materiales se procesan en el
   * orden devuelto por `service_material`, así que el orden del array basta
   * para casar cada update con su material sin rastrear el id).
   */
  function productsMock(
    stocks: Record<string, number | null>,
    productUpdates: Array<Record<string, unknown>>,
  ): (table: string) => Record<string, unknown> {
    return () => {
      let productId: string | null = null;
      const c: Record<string, unknown> = {};
      c.select = vi.fn(() => c);
      c.update = vi.fn((payload: Record<string, unknown>) => {
        productUpdates.push(payload);
        return c;
      });
      c.eq = vi.fn((column: string, value: string) => {
        if (column === "id") productId = value;
        return c;
      });
      c.single = vi.fn(async () => ({
        data: { id: productId, stock: productId !== null ? (stocks[productId] ?? null) : null },
        error: null,
      }));
      c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return c;
    };
  }

  /** Mock de `stock_movement` que captura cada `.insert(...)` en `insertedMovements`. */
  function stockMovementMock(
    insertedMovements: Array<Record<string, unknown>>,
  ): (table: string) => Record<string, unknown> {
    return () => {
      const c: Record<string, unknown> = {};
      c.insert = vi.fn((payload: Record<string, unknown>) => {
        insertedMovements.push(payload);
        return c;
      });
      c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return c;
    };
  }

  it("(a) realizado con service_id y 2 materiales en el escandallo: registra 2 salidas y baja products.stock", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "en_curso", service_id: SERVICE_ID, quantity: 1 });
    const updated = itemRow({
      state: "realizado",
      service_id: SERVICE_ID,
      quantity: 1,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });

    const insertedMovements: Array<Record<string, unknown>> = [];
    const productUpdates: Array<Record<string, unknown>> = [];
    const planItemChain = fromSequence({
      plan_item: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    const productsChain = productsMock({ [PRODUCT_A_ID]: 10, [PRODUCT_B_ID]: 5 }, productUpdates);
    const stockMovementChain = stockMovementMock(insertedMovements);

    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return planItemChain(table);
      if (table === "service_material") {
        return chain({
          data: [
            { product_id: PRODUCT_A_ID, quantity: 2 },
            { product_id: PRODUCT_B_ID, quantity: 1 },
          ],
          error: null,
        });
      }
      if (table === "products") return productsChain(table);
      if (table === "stock_movement") return stockMovementChain(table);
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(insertedMovements).toHaveLength(2);
    expect(insertedMovements[0]).toMatchObject({
      product_id: PRODUCT_A_ID,
      kind: "salida",
      quantity: -2,
      resulting_stock: 8,
      note: "Consumo automático — tratamiento realizado",
    });
    expect(insertedMovements[1]).toMatchObject({
      product_id: PRODUCT_B_ID,
      kind: "salida",
      quantity: -1,
      resulting_stock: 4,
    });
    expect(productUpdates).toEqual([{ stock: 8 }, { stock: 4 }]);
  });

  it("(b) sin service_id: no consulta service_material ni registra movimientos", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "en_curso", service_id: null, quantity: 1 });
    const updated = itemRow({
      state: "realizado",
      service_id: null,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });

    fromMock.mockImplementation(
      fromSequence({
        plan_item: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(fromMock).not.toHaveBeenCalledWith("service_material");
    expect(fromMock).not.toHaveBeenCalledWith("stock_movement");
  });

  it("(b) con service_id pero sin materiales en el escandallo: no registra movimientos", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "en_curso", service_id: SERVICE_ID, quantity: 1 });
    const updated = itemRow({
      state: "realizado",
      service_id: SERVICE_ID,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });

    const planItemChain = fromSequence({
      plan_item: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return planItemChain(table);
      if (table === "service_material") return chain({ data: [], error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(fromMock).not.toHaveBeenCalledWith("products");
    expect(fromMock).not.toHaveBeenCalledWith("stock_movement");
  });

  it("(c) stock insuficiente: NO falla la transición, descuenta hasta 0 (clamp)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = itemRow({ state: "en_curso", service_id: SERVICE_ID, quantity: 1 });
    const updated = itemRow({
      state: "realizado",
      service_id: SERVICE_ID,
      quantity: 1,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });

    const insertedMovements: Array<Record<string, unknown>> = [];
    const productUpdates: Array<Record<string, unknown>> = [];
    const planItemChain = fromSequence({
      plan_item: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    // Stock disponible (3) menor que el consumo pedido por el escandallo (5).
    const productsChain = productsMock({ [PRODUCT_A_ID]: 3 }, productUpdates);
    const stockMovementChain = stockMovementMock(insertedMovements);

    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return planItemChain(table);
      if (table === "service_material") {
        return chain({ data: [{ product_id: PRODUCT_A_ID, quantity: 5 }], error: null });
      }
      if (table === "products") return productsChain(table);
      if (table === "stock_movement") return stockMovementChain(table);
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(insertedMovements).toHaveLength(1);
    expect(insertedMovements[0]).toMatchObject({
      product_id: PRODUCT_A_ID,
      kind: "salida",
      quantity: -3,
      resulting_stock: 0,
    });
    expect(productUpdates).toEqual([{ stock: 0 }]);
  });

  it("best-effort: si el fetch de service_material falla, la transición sigue { ok:true } (se registra con console.error)", async () => {
    salon("odontologia");
    membership("owner");

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const existing = itemRow({ state: "en_curso", service_id: SERVICE_ID, quantity: 1 });
    const updated = itemRow({
      state: "realizado",
      service_id: SERVICE_ID,
      executed_at: "2026-08-01T12:00:00.000Z",
      executed_by: "user-1",
    });

    const planItemChain = fromSequence({
      plan_item: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return planItemChain(table);
      if (table === "service_material") {
        return chain({ data: null, error: { message: "boom service_material" } });
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await transitionPlanItem(ITEM_ID, "realizado");

    expect(result).toEqual({ ok: true, data: updated });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// deletePlanItem / deletePlan — owner/manager
// ---------------------------------------------------------------------------

describe("deletePlanItem / deletePlan", () => {
  it("deletePlanItem: owner ⇒ borra la línea", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "plan_item") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deletePlanItem(ITEM_ID);

    expect(result).toEqual({ ok: true, data: { id: ITEM_ID } });
  });

  it("deletePlan: manager ⇒ borra el plan", async () => {
    salon("odontologia");
    membership("manager");
    fromMock.mockImplementation((table: string) => {
      if (table === "treatment_plan") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deletePlan(PLAN_ID);

    expect(result).toEqual({ ok: true, data: { id: PLAN_ID } });
  });

  it("deletePlan: staff ⇒ { ok:false } (solo owner/manager)", async () => {
    salon("odontologia");
    membership("staff");

    const result = await deletePlan(PLAN_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updatePlanStatus
// ---------------------------------------------------------------------------

describe("updatePlanStatus", () => {
  it("actualiza el estado del plan", async () => {
    salon("odontologia");
    membership("manager");
    const updatedPlan = { ...PLAN_ROW, status: "proposed" };
    fromMock.mockImplementation((table: string) => {
      if (table === "treatment_plan") return chain({ data: updatedPlan, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await updatePlanStatus(PLAN_ID, "proposed");

    expect(result).toEqual({ ok: true, data: updatedPlan });
  });
});
