/**
 * Tests de integración del REINTENTO MANUAL de fidelización (§sub-7):
 * `retrySaleLoyalty` de `app/(dashboard)/tpv/actions`.
 *
 * Cuando el best-effort de `createSale` falla al cerrar el cobro, la venta queda
 * cobrada pero sin puntos y el recibo devuelve un ancla de reintento. Esta acción
 * reacredita sobre la MISMA venta —sin re-cobrar y sin poder duplicar— reusando la
 * `ref = { pos_sale, saleId }`. Aquí se prueba ese CABLEADO:
 *   · reconstruye las líneas desde `pos_sale_lines` (fuente autoritativa) y llama a
 *     `awardVisit` con la ref idempotente;
 *   · es idempotente (si ya estaba acreditada, `alreadyAwarded` y `pointsEarned: 0`);
 *   · NUNCA revierte la venta, ni siquiera si el propio reintento falla;
 *   · rechaza un `saleId` ajeno al salón activo SIN acreditar.
 *
 * `awardVisit` se DOBLA (`vi.fn()`): su lógica (puntos, hitos, canje, idempotencia
 * real) ya está cubierta en `loyalty-server.test.ts`. Supabase se sustituye por un
 * builder mínimo; `pos_sales` delete cuenta rollbacks para afirmar que NO ocurren.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { AwardVisitResult } from "@/lib/loyalty/types";
import type { RetrySaleLoyaltyInput } from "@/lib/validations/sale";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario e instrumentación (izados por encima de los `vi.mock`).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_ID = "salon-1";
const USER_ID = "user-1";
const SALE_ID = "22222222-2222-4222-8222-222222222222";
const LOYALTY_CUSTOMER = "11111111-1111-4111-8111-111111111111";
const REWARD = {
  id: "rw-1",
  type: "SCALP_DIAGNOSIS",
  code: "RW-SCA-ABC123",
  expires_at: "2026-10-15T00:00:00.000Z",
} as const;

const holder = vi.hoisted(() => ({
  rollbackDeletes: 0,
  /** ¿La venta existe en el salón activo? (false ⇒ 404 controlado). */
  saleExists: true,
  /** Líneas persistidas que se reconstruyen para acreditar. */
  lines: [{ description: "Corte", line_total_cents: 1000 }] as Array<{
    description: string;
    line_total_cents: number;
  }>,
}));

/** Resultado que devuelve cada tabla/op del doble de Supabase. */
function resolve(table: string, op: string): { data: unknown; error: null } {
  if (table === "pos_sales" && op === "select") {
    return { data: holder.saleExists ? { id: SALE_ID } : null, error: null };
  }
  if (table === "pos_sale_lines" && op === "select") {
    return { data: holder.lines, error: null };
  }
  if (table === "pos_sales" && op === "delete") {
    holder.rollbackDeletes += 1; // rollback de compensación (NO debe ocurrir nunca)
    return { data: null, error: null };
  }
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

import { retrySaleLoyalty } from "@/app/(dashboard)/tpv/actions";
import { awardVisit, LoyaltyActionError } from "@/lib/loyalty/server";

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

/** Payload base del reintento (venta + cliente + sin cupón). */
function retryInput(over: Partial<RetrySaleLoyaltyInput> = {}): RetrySaleLoyaltyInput {
  return { saleId: SALE_ID, customerId: LOYALTY_CUSTOMER, redeemCoupon: false, ...over };
}

beforeEach(() => {
  holder.rollbackDeletes = 0;
  holder.saleExists = true;
  holder.lines = [{ description: "Corte", line_total_cents: 1000 }];
  awardVisitMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {}); // silencia el log best-effort
});

describe("retrySaleLoyalty · reintento manual de fidelización (sub-7)", () => {
  it("reacredita reconstruyendo las líneas persistidas y con ref idempotente", async () => {
    awardVisitMock.mockResolvedValue(
      awardResult({ points_earned: 5, points_balance: 42, reward: { ...REWARD } }),
    );

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(true);
    // Importes desde `pos_sale_lines` (no del cliente), etiqueta de la línea y la
    // MISMA ref que usó el cierre para NO duplicar.
    expect(awardVisitMock).toHaveBeenCalledTimes(1);
    expect(awardVisitMock).toHaveBeenCalledWith({
      salon_id: SALON_ID,
      customer_id: LOYALTY_CUSTOMER,
      line_items: [{ price_cents: 1000, label: "Corte" }],
      redeem_coupon: false,
      ref: { type: "pos_sale", id: SALE_ID },
    });
    if (!result.ok) throw new Error("esperaba reintento OK");
    expect(result.data).toEqual({
      pointsEarned: 5,
      pointsBalance: 42,
      reward: { ...REWARD },
      alreadyAwarded: false,
    });
    // El reintento no toca el cobro: la venta no se borra.
    expect(holder.rollbackDeletes).toBe(0);
  });

  it("reconstruye TODAS las líneas persistidas (importe con el cupón ya prorrateado)", async () => {
    holder.lines = [
      { description: "Corte", line_total_cents: 900 },
      { description: "Champú", line_total_cents: 450 },
    ];
    awardVisitMock.mockResolvedValue(awardResult());

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(true);
    expect(awardVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price_cents: 900, label: "Corte" },
          { price_cents: 450, label: "Champú" },
        ],
      }),
    );
  });

  it("propaga redeem_coupon=true para reintentar también el canje del cupón", async () => {
    awardVisitMock.mockResolvedValue(awardResult());

    const result = await retrySaleLoyalty(retryInput({ redeemCoupon: true }));

    expect(result.ok).toBe(true);
    expect(awardVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({ redeem_coupon: true }),
    );
  });

  it("es idempotente: si la venta ya estaba acreditada, no duplica (alreadyAwarded)", async () => {
    awardVisitMock.mockResolvedValue(
      awardResult({ points_earned: 0, points_balance: 42, already_awarded: true }),
    );

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperaba reintento OK");
    expect(result.data.alreadyAwarded).toBe(true);
    expect(result.data.pointsEarned).toBe(0);
    expect(result.data.pointsBalance).toBe(42);
  });

  it("si awardVisit falla, devuelve error y NUNCA revierte la venta", async () => {
    awardVisitMock.mockRejectedValue(new Error("fallo de fidelización"));

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("esperaba error");
    expect(awardVisitMock).toHaveBeenCalledTimes(1);
    // El cobro sigue firme: no se compensó/borró la venta pese al fallo.
    expect(holder.rollbackDeletes).toBe(0);
  });

  it("traduce un LoyaltyActionError de dominio a su mensaje", async () => {
    awardVisitMock.mockRejectedValue(
      new LoyaltyActionError("forbidden", 403, "Sin permiso en este salón."),
    );

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("esperaba error");
    expect(result.error).toBe("Sin permiso en este salón.");
    expect(holder.rollbackDeletes).toBe(0);
  });

  it("rechaza un saleId ajeno al salón activo SIN acreditar (defensa multi-tenant)", async () => {
    holder.saleExists = false;

    const result = await retrySaleLoyalty(retryInput());

    expect(result.ok).toBe(false);
    expect(awardVisitMock).not.toHaveBeenCalled();
    expect(holder.rollbackDeletes).toBe(0);
  });

  it("rechaza payloads no válidos (saleId no-UUID) sin tocar fidelización", async () => {
    const result = await retrySaleLoyalty({
      saleId: "no-es-uuid",
      customerId: LOYALTY_CUSTOMER,
      redeemCoupon: false,
    });

    expect(result.ok).toBe(false);
    expect(awardVisitMock).not.toHaveBeenCalled();
  });
});
