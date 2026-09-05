/**
 * Server actions del escandallo (BOM) de materiales por tratamiento
 * (`app/(dashboard)/ajustes/servicios/material-actions`).
 *
 * Mismo patrón que `stock-actions.test.ts`: se mockea `@/lib/salon`
 * (getActiveMembership), `@/lib/supabase/server` (chain encadenable +
 * then-able) y `next/cache`. Gate SOLO de rol (owner/manager) — a diferencia
 * de `stock-actions.ts` (que también deja escribir a `staff`), aquí el
 * escandallo es configuración del catálogo, no una operación diaria de caja.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { membershipMock, fromMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: () => membershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addServiceMaterial,
  removeServiceMaterial,
  updateServiceMaterialQty,
} from "@/app/(dashboard)/ajustes/servicios/material-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const SERVICE_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const MATERIAL_ID = "33333333-3333-3333-3333-333333333333";

function membership(role: MemberRole): void {
  membershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

/** Chain de Supabase encadenable y "then-able": resuelve `result` sin importar qué se encadene. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function materialRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: MATERIAL_ID,
    salon_id: SALON_ID,
    service_id: SERVICE_ID,
    product_id: PRODUCT_ID,
    quantity: 2,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Gate de rol — compartido por las 3 acciones
// ---------------------------------------------------------------------------

describe("gate de escritura del escandallo (owner/manager)", () => {
  it("sin membresía activa ⇒ { ok:false }, sin tocar la BD", async () => {
    membershipMock.mockResolvedValue(null);

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rol staff ⇒ { ok:false } (a diferencia de stock-actions.ts, aquí staff NO puede escribir)", async () => {
    membership("staff");

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    expect(result).toEqual({
      ok: false,
      error: "No tienes permiso para gestionar el escandallo de materiales.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("removeServiceMaterial: rol staff ⇒ { ok:false }", async () => {
    membership("staff");

    const result = await removeServiceMaterial(MATERIAL_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("updateServiceMaterialQty: rol staff ⇒ { ok:false }", async () => {
    membership("staff");

    const result = await updateServiceMaterialQty(MATERIAL_ID, 3);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// addServiceMaterial
// ---------------------------------------------------------------------------

describe("addServiceMaterial", () => {
  it("cantidad <= 0 ⇒ rechazo antes de tocar la BD", async () => {
    membership("owner");

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 0,
    });

    expect(result).toEqual({ ok: false, error: "La cantidad debe ser mayor que cero." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("owner/manager + cantidad válida ⇒ inserta la línea del escandallo", async () => {
    membership("manager");
    const inserted = materialRow();
    fromMock.mockImplementation((table: string) => {
      if (table === "service_material") return chain({ data: inserted, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });

    expect(result).toEqual({ ok: true, data: inserted });
    expect(fromMock).toHaveBeenCalledWith("service_material");
  });

  it("violación de UNIQUE(service_id, product_id) ⇒ mensaje legible en vez del error crudo", async () => {
    membership("owner");
    fromMock.mockImplementation(() =>
      chain({
        data: null,
        error: { code: "23505", message: 'duplicate key value violates unique constraint "service_material_service_id_product_id_key"' },
      }),
    );

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: "Este producto ya forma parte del escandallo de este servicio.",
    });
  });

  it("otro error de BD ⇒ se propaga tal cual", async () => {
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await addServiceMaterial({
      serviceId: SERVICE_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// removeServiceMaterial
// ---------------------------------------------------------------------------

describe("removeServiceMaterial", () => {
  it("owner ⇒ borra la línea del escandallo", async () => {
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "service_material") return chain({ data: null, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await removeServiceMaterial(MATERIAL_ID);

    expect(result).toEqual({ ok: true, data: { id: MATERIAL_ID } });
  });

  it("error de BD ⇒ se propaga", async () => {
    membership("manager");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom delete" } }));

    const result = await removeServiceMaterial(MATERIAL_ID);

    expect(result).toEqual({ ok: false, error: "boom delete" });
  });
});

// ---------------------------------------------------------------------------
// updateServiceMaterialQty
// ---------------------------------------------------------------------------

describe("updateServiceMaterialQty", () => {
  it("cantidad <= 0 ⇒ rechazo antes de tocar la BD", async () => {
    membership("owner");

    const result = await updateServiceMaterialQty(MATERIAL_ID, -1);

    expect(result).toEqual({ ok: false, error: "La cantidad debe ser mayor que cero." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("owner/manager + cantidad válida ⇒ actualiza la cantidad", async () => {
    membership("owner");
    const updated = materialRow({ quantity: 5 });
    fromMock.mockImplementation((table: string) => {
      if (table === "service_material") return chain({ data: updated, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await updateServiceMaterialQty(MATERIAL_ID, 5);

    expect(result).toEqual({ ok: true, data: updated });
  });
});
