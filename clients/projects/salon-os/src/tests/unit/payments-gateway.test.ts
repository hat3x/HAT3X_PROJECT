/**
 * Tests unitarios de la pasarela de pago (`@/lib/payments` → gateway/manual).
 *
 * Cubre el contrato de la abstracción y la implementación manual:
 *   · registra una fila de `pos_payments` por tender (pago simple y mixto).
 *   · no procesa cobro: solo transforma y valida (status 'registered').
 *   · exige que los tenders liquiden EXACTAMENTE el total (ni de más ni de menos).
 *   · el selector `getPaymentGateway` devuelve la manual y rechaza las no impl.
 */
import { describe, it, expect } from "vitest";

import {
  assertTendersCoverTotal,
  getPaymentGateway,
  isMixedPayment,
  manualPaymentGateway,
  PaymentValidationError,
  sumTenders,
  type PaymentTender,
  type RegisterPaymentInput,
} from "@/lib/payments";

const SALON = "00000000-0000-0000-0000-000000000001";
const SALE = "00000000-0000-0000-0000-0000000000a1";
const SESSION = "00000000-0000-0000-0000-0000000000b2";

function baseInput(overrides: Partial<RegisterPaymentInput> = {}): RegisterPaymentInput {
  return {
    salonId: SALON,
    saleId: SALE,
    totalCents: 2000,
    tenders: [{ method: "efectivo", amountCents: 2000 }],
    ...overrides,
  };
}

describe("helpers de tenders", () => {
  it("suma importes y detecta pago mixto", () => {
    const tenders: PaymentTender[] = [
      { method: "efectivo", amountCents: 1200 },
      { method: "tarjeta", amountCents: 800 },
    ];
    expect(sumTenders(tenders)).toBe(2000);
    expect(isMixedPayment(tenders)).toBe(true);
    expect(isMixedPayment(tenders.slice(0, 1))).toBe(false);
  });

  it("assertTendersCoverTotal exige cuadre exacto y al menos un tender", () => {
    expect(() => assertTendersCoverTotal([], 2000)).toThrow(PaymentValidationError);
    expect(() =>
      assertTendersCoverTotal([{ method: "efectivo", amountCents: 1900 }], 2000),
    ).toThrow(PaymentValidationError);
    expect(() =>
      assertTendersCoverTotal([{ method: "efectivo", amountCents: 0 }], 0),
    ).toThrow(PaymentValidationError);
    expect(() =>
      assertTendersCoverTotal([{ method: "efectivo", amountCents: 2000 }], 2000),
    ).not.toThrow();
  });
});

describe("ManualPaymentGateway.registerPayment", () => {
  it("registra un pago simple como una fila de pos_payments", async () => {
    const result = await manualPaymentGateway.registerPayment(baseInput());
    expect(result.status).toBe("registered");
    expect(result.registeredCents).toBe(2000);
    expect(result.payments).toEqual([
      {
        salon_id: SALON,
        sale_id: SALE,
        session_id: null,
        method: "efectivo",
        payment_method_id: null,
        amount_cents: 2000,
        reference: null,
      },
    ]);
  });

  it("registra un pago mixto como varias filas (efectivo + bizum)", async () => {
    const result = await manualPaymentGateway.registerPayment(
      baseInput({
        sessionId: SESSION,
        tenders: [
          { method: "efectivo", amountCents: 1200 },
          { method: "bizum", amountCents: 800, reference: "BIZ-9931" },
        ],
      }),
    );
    expect(result.payments).toHaveLength(2);
    expect(result.payments.map((p) => p.method)).toEqual(["efectivo", "bizum"]);
    expect(result.payments[1]!.reference).toBe("BIZ-9931");
    expect(result.payments.every((p) => p.session_id === SESSION)).toBe(true);
  });

  it("propaga paid_at solo si se indica (si no, lo pone la BD)", async () => {
    const withDate = await manualPaymentGateway.registerPayment(
      baseInput({ paidAt: "2026-07-14T10:00:00.000Z" }),
    );
    expect(withDate.payments[0]!.paid_at).toBe("2026-07-14T10:00:00.000Z");

    const withoutDate = await manualPaymentGateway.registerPayment(baseInput());
    expect(withoutDate.payments[0]).not.toHaveProperty("paid_at");
  });

  it("rechaza un cobro que no cuadra con el total", async () => {
    await expect(
      manualPaymentGateway.registerPayment(
        baseInput({ tenders: [{ method: "tarjeta", amountCents: 1500 }] }),
      ),
    ).rejects.toBeInstanceOf(PaymentValidationError);
  });
});

describe("getPaymentGateway", () => {
  it("devuelve la pasarela manual por defecto", () => {
    expect(getPaymentGateway().id).toBe("manual");
    expect(getPaymentGateway("manual")).toBe(manualPaymentGateway);
  });

  it("lanza para pasarelas aún no implementadas (roadmap)", () => {
    expect(() => getPaymentGateway("sumup")).toThrow();
    expect(() => getPaymentGateway("stripe")).toThrow();
    expect(() => getPaymentGateway("redsys")).toThrow();
  });
});
