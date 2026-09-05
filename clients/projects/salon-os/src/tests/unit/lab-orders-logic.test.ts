import { describe, it, expect } from "vitest";

import {
  computeAlignerProgress,
  labOrderStatus,
  LAB_ORDER_KIND_LABELS,
} from "@/lib/dental/lab-orders";

describe("labOrderStatus", () => {
  it("enviado cuando solo hay sentAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: null, deliveredAt: null })).toBe("enviado");
  });
  it("recibido cuando hay receivedAt pero no deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: null })).toBe("recibido");
  });
  it("entregado cuando hay deliveredAt", () => {
    expect(labOrderStatus({ sentAt: "2026-08-01", receivedAt: "2026-08-05", deliveredAt: "2026-08-06" })).toBe("entregado");
  });
});

describe("computeAlignerProgress", () => {
  it("entregados = mayor alignerDelivered; pendientes = total - entregados", () => {
    const p = computeAlignerProgress(24, [3, 7, null, 5]);
    expect(p).toEqual({ total: 24, delivered: 7, pending: 17 });
  });
  it("sin total → todo 0, pendientes no negativo", () => {
    expect(computeAlignerProgress(null, [2])).toEqual({ total: 0, delivered: 2, pending: 0 });
  });
  it("sin entregas → delivered 0", () => {
    expect(computeAlignerProgress(10, [])).toEqual({ total: 10, delivered: 0, pending: 10 });
  });
});

describe("LAB_ORDER_KIND_LABELS", () => {
  it("cubre las 5 clases", () => {
    expect(Object.keys(LAB_ORDER_KIND_LABELS)).toHaveLength(5);
    expect(LAB_ORDER_KIND_LABELS.alineadores).toBe("Alineadores");
  });
});
