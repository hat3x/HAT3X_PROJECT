/**
 * Tests de integración del CABLEADO de fidelización en el cierre de caja
 * (`createSale` de `app/(dashboard)/tpv/actions`) — sub-6.
 *
 * `awardVisit` ya está cubierto de extremo a extremo en `loyalty-server.test.ts`
 * (regla de puntos `ceil(price_cents/200)`, canje del cupón, hitos, idempotencia).
 * Aquí se DOBLA para probar lo que sub-6 añade encima: que la venta, una vez
 * persistida, acredita la visita del cliente ESCANEADO con los argumentos
 * correctos y —sobre todo— que la acreditación es BEST-EFFORT: si `awardVisit`
 * falla, el cobro NI se bloquea NI se revierte (se devuelve `loyalty: null`).
 *
 * Supabase y la capa de dependencias se sustituyen por dobles mínimos:
 *   · `@/lib/supabase/server` / `admin` → un builder que resuelve las escrituras
 *     del TPV (pos_sales/pos_sale_lines/pos_payments) sin BD real. `pos_sales`
 *     delete cuenta los rollbacks para poder afirmar que NO ocurrieron.
 *   · `@/lib/salon` → salón activo fijo.  · `next/cache` → `revalidatePath` no-op.
 *   · `@/lib/loyalty/server` → real, salvo `awardVisit`, que es un `vi.fn()`.
 * La pasarela de pago manual es PURA (sin BD): se usa la real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { AwardVisitResult } from "@/lib/loyalty/types";
import type { SaleInput } from "@/lib/validations/sale";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario e instrumentación (izados por encima de los `vi.mock`).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_ID = "salon-1";
const USER_ID = "user-1";
const SALE_ID = "22222222-2222-4222-8222-222222222222";
const LOYALTY_CUSTOMER = "11111111-1111-4111-8111-111111111111";
const COUPON_ID = "33333333-3333-4333-8333-333333333333";

const holder = vi.hoisted(() => ({ rollbackDeletes: 0 }));

/** Resultado que devuelve cada tabla/op del doble de Supabase para el TPV. */
function resolve(table: string, op: string): { data: unknown; error: null } {
  if (table === "pos_sales" && op === "insert") {
    return { data: { id: SALE_ID }, error: null };
  }
  if (table === "pos_sales" && op === "delete") {
    holder.rollbackDeletes += 1; // rollback de compensación (NO debe ocurrir aquí)
    return { data: null, error: null };
  }
  // Rama con descuento (`resolveActiveCouponPercentOff`): el usuario pertenece al
  // salón activo y el cupón sigue vigente al 10%.
  if (table === "salon_members") {
    return { data: { salon_id: SALON_ID }, error: null };
  }
  if (table === "welcome_coupons") {
    return { data: { percent_off: 10 }, error: null };
  }
  // pos_sessions (sin caja abierta), inserts de líneas/pagos: sin error.
  return { data: null, error: null };
}

/** Builder encadenable y "thenable" mínimo sobre `resolve`. */
function makeBuilder(table: string) {
  let op: "select" | "insert" | "delete" = "select";
  const b = {
    select: () => b,
    eq: () => b,
    gt: () => b,
    is: () => b,
    order: () => b,
    limit: () => b,
    insert: () => {
      op = "insert";
      return b;
    },
    delete: () => {
      op = "delete";
      return b;
    },
    maybeSingle: () => Promise.resolve(resolve(table, op)),
    single: () => Promise.resolve(resolve(table, op)),
    then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
      onFulfilled(resolve(table, op)),
  };
  return b;
}

function makeClient() {
  return {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }),
    },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve(SALON_ID) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("@/lib/loyalty/server", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/loyalty/server")>();
  return { ...actual, awardVisit: vi.fn() };
});

import { createSale } from "@/app/(dashboard)/tpv/actions";
import { awardVisit } from "@/lib/loyalty/server";

const awardVisitMock = vi.mocked(awardVisit);

/** Resultado de éxito de `awardVisit` con overrides puntuales. */
function awardResult(over: Partial<AwardVisitResult> = {}): AwardVisitResult {
  return {
    points_earned: 5,
    points_balance: 42,
    visits_total: 3,
    redeemed_coupon: null,
    discount_cents: 0,
    reward: null,
    already_awarded: false,
    ...over,
  };
}

/** Venta base: una línea manual "Corte" de 10,00 € (IVA 21%) y un tender exacto. */
function baseSale(over: Partial<SaleInput> = {}): SaleInput {
  return {
    lines: [
      { kind: "manual", refId: null, description: "Corte", quantity: "1", unitPrice: "10,00", vatRate: "21" },
    ],
    tenders: [{ method: "efectivo", amount: "10,00" }],
    ...over,
  };
}

beforeEach(() => {
  holder.rollbackDeletes = 0;
  awardVisitMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {}); // silencia el log best-effort
});

describe("createSale · integración de fidelización (sub-6)", () => {
  it("acredita la visita del cliente escaneado con ref idempotente y puntos en céntimos", async () => {
    awardVisitMock.mockResolvedValue(
      awardResult({
        points_earned: 5,
        points_balance: 42,
        reward: {
          id: "rw-1",
          type: "SCALP_DIAGNOSIS",
          code: "RW-SCA-ABC123",
          expires_at: "2026-10-15T00:00:00.000Z",
        },
      }),
    );

    const result = await createSale(baseSale({ loyaltyCustomerId: LOYALTY_CUSTOMER }));

    expect(result.ok).toBe(true);
    // Contrato de `awardVisit`: salón, cliente escaneado, líneas en céntimos con su
    // etiqueta, sin canje de cupón y ref = {pos_sale, saleId} para IDEMPOTENCIA.
    expect(awardVisitMock).toHaveBeenCalledTimes(1);
    expect(awardVisitMock).toHaveBeenCalledWith({
      salon_id: SALON_ID,
      customer_id: LOYALTY_CUSTOMER,
      line_items: [{ price_cents: 1000, label: "Corte" }],
      redeem_coupon: false,
      ref: { type: "pos_sale", id: SALE_ID },
    });
    // Se devuelven al cajero points_earned, points_balance y reward.
    if (!result.ok) throw new Error("esperaba venta OK");
    expect(result.data.loyalty).toEqual({
      pointsEarned: 5,
      pointsBalance: 42,
      reward: {
        id: "rw-1",
        type: "SCALP_DIAGNOSIS",
        code: "RW-SCA-ABC123",
        expires_at: "2026-10-15T00:00:00.000Z",
      },
    });
  });

  it("es BEST-EFFORT: si awardVisit falla, la venta ni se bloquea ni se revierte", async () => {
    awardVisitMock.mockRejectedValue(new Error("fallo de fidelización"));

    const result = await createSale(baseSale({ loyaltyCustomerId: LOYALTY_CUSTOMER }));

    // El cobro sigue firme (ok) y con sus totales; solo la fidelización queda a null.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperaba venta OK");
    expect(result.data.loyalty).toBeNull();
    expect(result.data.totalCents).toBe(1000);
    // Y NO se compensó/borró la venta pese al fallo de la acreditación.
    expect(holder.rollbackDeletes).toBe(0);
  });

  it("no toca fidelización si no se escaneó a ningún cliente (aditivo)", async () => {
    const result = await createSale(baseSale());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperaba venta OK");
    expect(awardVisitMock).not.toHaveBeenCalled();
    expect(result.data.loyalty).toBeNull();
  });

  it("canjea el cupón (redeem_coupon=true), acredita al dueño del cupón y descuenta las líneas", async () => {
    awardVisitMock.mockResolvedValue(awardResult({ points_earned: 5, points_balance: 47 }));

    // Con un cupón del 10% sobre 10,00 €, el total cobrado baja a 9,00 € (tender exacto).
    const result = await createSale(
      baseSale({
        coupon: { id: COUPON_ID, customerId: LOYALTY_CUSTOMER },
        tenders: [{ method: "efectivo", amount: "9,00" }],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperaba venta OK");
    expect(result.data.totalCents).toBe(900);
    // `redeem_coupon=true`, puntos sobre el importe DESCONTADO (900) y, a falta de
    // `loyaltyCustomerId`, el cliente a acreditar es el dueño del cupón.
    expect(awardVisitMock).toHaveBeenCalledWith({
      salon_id: SALON_ID,
      customer_id: LOYALTY_CUSTOMER,
      line_items: [{ price_cents: 900, label: "Corte" }],
      redeem_coupon: true,
      ref: { type: "pos_sale", id: SALE_ID },
    });
  });
});
