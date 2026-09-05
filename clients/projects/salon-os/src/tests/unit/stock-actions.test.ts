/**
 * Server action `recordStockMovement` (`app/(dashboard)/products/stock-actions`).
 *
 * Mismo patrón que `planes-actions.test.ts`/`facturas-delete-action.test.ts`:
 * se mockea `@/lib/salon` (getActiveMembership), `@/lib/supabase/server`
 * (chain encadenable + then-able) y `next/cache`. A diferencia de
 * `planes-actions.test.ts`, aquí el gate es SOLO de rol (sin sector) — no hay
 * `getActiveSalon` de por medio.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { membershipMock, fromMock, getUserMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: () => membershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { recordStockMovement } from "@/app/(dashboard)/products/stock-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const MOVEMENT_ID = "22222222-2222-2222-2222-222222222222";

function membership(role: MemberRole): void {
  membershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

/** Chain de Supabase encadenable y "then-able": resuelve `result` sin importar qué se encadene. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.insert = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

/**
 * Configura `fromMock` para devolver, por tabla, una secuencia de resultados
 * (consumidos en orden de llamada; se repite el último si se agotan). Mismo
 * helper que `planes-actions.test.ts`: permite que "products" devuelva
 * primero la fila del SELECT y luego el resultado del UPDATE.
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

function productRow(stock: number | null): { id: string; stock: number | null } {
  return { id: PRODUCT_ID, stock };
}

function movementRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: MOVEMENT_ID,
    salon_id: SALON_ID,
    product_id: PRODUCT_ID,
    kind: "entrada",
    quantity: 5,
    resulting_stock: 15,
    lot: null,
    expiry: null,
    note: null,
    created_by: "user-1",
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// ---------------------------------------------------------------------------
// Gate — sin salón / sin rol (d)
// ---------------------------------------------------------------------------

describe("gate de escritura de stock (rol, sin sector)", () => {
  it("(d) sin membresía activa ⇒ { ok:false }, sin tocar la BD", async () => {
    membershipMock.mockResolvedValue(null);

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
    });

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(d) rol staff SÍ puede escribir (a diferencia de los módulos dentales, sin excluir staff)", async () => {
    membership("staff");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }, { data: null, error: null }],
        stock_movement: [{ data: movementRow(), error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
    });

    expect(result.ok).toBe(true);
  });

  it("cantidad 0 ⇒ rechazo antes de tocar la BD (el check de BD exige quantity <> 0)", async () => {
    membership("owner");

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 0,
    });

    expect(result).toEqual({ ok: false, error: "La cantidad no puede ser cero." });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (a) entrada — suma al stock
// ---------------------------------------------------------------------------

describe("recordStockMovement · entrada", () => {
  it("(a) entrada: suma la cantidad al stock actual y persiste quantity=delta, resulting_stock=nuevo total", async () => {
    membership("owner");
    const inserted = movementRow({ kind: "entrada", quantity: 5, resulting_stock: 15 });

    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }, { data: null, error: null }],
        stock_movement: [{ data: inserted, error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
      lot: "L-2026-08",
      expiry: "2026-12-01",
    });

    expect(result).toEqual({ ok: true, data: inserted });
    expect(fromMock).toHaveBeenCalledWith("products");
    expect(fromMock).toHaveBeenCalledWith("stock_movement");
  });

  it("producto con stock null (no inventariado): empieza a contarse desde 0", async () => {
    membership("manager");
    const inserted = movementRow({ kind: "entrada", quantity: 3, resulting_stock: 3 });

    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(null), error: null }, { data: null, error: null }],
        stock_movement: [{ data: inserted, error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 3,
    });

    expect(result).toEqual({ ok: true, data: inserted });
  });
});

// ---------------------------------------------------------------------------
// (b) salida que excede el stock ⇒ error, sin insertar ni actualizar
// ---------------------------------------------------------------------------

describe("recordStockMovement · salida/merma", () => {
  it("(b) salida que excede el stock disponible ⇒ { ok:false, error:'No hay suficiente stock.' }", async () => {
    membership("owner");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(3), error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "salida",
      quantity: 10,
    });

    expect(result).toEqual({ ok: false, error: "No hay suficiente stock." });
    // Ni inserta el movimiento ni actualiza products.stock.
    expect(fromMock).not.toHaveBeenCalledWith("stock_movement");
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("merma que excede el stock disponible ⇒ mismo error", async () => {
    membership("staff");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(1), error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "merma",
      quantity: 5,
    });

    expect(result.ok).toBe(false);
  });

  it("salida dentro del stock disponible ⇒ éxito", async () => {
    membership("owner");
    const inserted = movementRow({ kind: "salida", quantity: -4, resulting_stock: 6 });

    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }, { data: null, error: null }],
        stock_movement: [{ data: inserted, error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "salida",
      quantity: 4,
    });

    expect(result).toEqual({ ok: true, data: inserted });
  });
});

// ---------------------------------------------------------------------------
// (c) ajuste — fija el total
// ---------------------------------------------------------------------------

describe("recordStockMovement · ajuste", () => {
  it("(c) ajuste: fija el stock al nuevo total indicado (quantity = nuevo total, no delta)", async () => {
    membership("owner");
    // currentStock=10, ajuste a 25 ⇒ delta persistido = 15, resulting_stock = 25.
    const inserted = movementRow({ kind: "ajuste", quantity: 15, resulting_stock: 25 });

    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }, { data: null, error: null }],
        stock_movement: [{ data: inserted, error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "ajuste",
      quantity: 25,
    });

    expect(result).toEqual({ ok: true, data: inserted });
  });

  it("ajuste a un total negativo ⇒ rechazado igual que una salida que excede", async () => {
    membership("owner");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "ajuste",
      quantity: -1,
    });

    expect(result).toEqual({ ok: false, error: "No hay suficiente stock." });
  });
});

// ---------------------------------------------------------------------------
// Errores de BD / producto inexistente
// ---------------------------------------------------------------------------

describe("recordStockMovement · errores", () => {
  it("producto inexistente o de otro salón ⇒ error legible, sin insertar movimiento", async () => {
    membership("owner");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: null, error: { message: "no rows" } }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: "El producto no existe o no es accesible.",
    });
    expect(fromMock).not.toHaveBeenCalledWith("stock_movement");
  });

  it("error de BD al insertar el movimiento ⇒ se propaga, sin actualizar products.stock", async () => {
    membership("owner");
    fromMock.mockImplementation(
      fromSequence({
        products: [{ data: productRow(10), error: null }],
        stock_movement: [{ data: null, error: { message: "boom insert" } }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
    });

    expect(result).toEqual({ ok: false, error: "boom insert" });
    // Solo una llamada a "products" (el SELECT); nunca llega al UPDATE.
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("error de BD al actualizar products.stock ⇒ se propaga", async () => {
    membership("owner");
    const inserted = movementRow();
    fromMock.mockImplementation(
      fromSequence({
        products: [
          { data: productRow(10), error: null },
          { data: null, error: { message: "boom update" } },
        ],
        stock_movement: [{ data: inserted, error: null }],
      }),
    );

    const result = await recordStockMovement({
      productId: PRODUCT_ID,
      kind: "entrada",
      quantity: 5,
    });

    expect(result).toEqual({ ok: false, error: "boom update" });
  });
});
