import { describe, it, expect, beforeEach, vi } from "vitest";

const { getActiveSalonMock, getActiveMembershipMock, rpcMock, fromMock, getUserMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    rpcMock: vi.fn(),
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
  }));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (t: string) => fromMock(t),
    rpc: (fn: string, args: unknown) => rpcMock(fn, args),
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createOrthoPaymentPlan } from "@/app/(dashboard)/ortodoncia/payment-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createOrthoPaymentPlan", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza a staff (crear plan es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
  });

  it("owner: llama a la RPC con el calendario calculado y devuelve el planId", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    rpcMock.mockResolvedValue({ data: "plan-123", error: null });

    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.planId).toBe("plan-123");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0] as [string, unknown];
    expect(fn).toBe("create_ortho_payment_plan");
    // entrada + 24 cuotas
    expect((args as { p_installments: unknown[] }).p_installments).toHaveLength(25);
    expect((args as { p_salon_id: string }).p_salon_id).toBe("s1");
  });

  it("traduce el error PLAN_EXISTS de la RPC a un mensaje claro", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    rpcMock.mockResolvedValue({ data: null, error: { message: "PLAN_EXISTS" } });
    const res = await createOrthoPaymentPlan("c1", {
      totalCents: 300000, downPaymentCents: 60000, installmentCount: 24, dayOfMonth: 5, startDate: "2026-08-20",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ya tiene un plan/i);
  });
});
