import { describe, it, expect, beforeEach, vi } from "vitest";

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
  createClient: () => ({ from: (t: string) => fromMock(t), auth: { getUser: () => getUserMock() } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createLabOrder, deleteLabOrder } from "@/app/(dashboard)/ortodoncia/lab-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createLabOrder", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    getActiveMembershipMock.mockResolvedValue({ role: "owner" });
    const res = await createLabOrder("c1", { kind: "alineadores", labName: "Lab", sentAt: "2026-08-10" });
    expect(res.ok).toBe(false);
  });

  it("staff puede crear (inserta acotado por salon)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    let inserted: Record<string, unknown> | null = null;
    fromMock.mockReturnValue({
      insert: (p: Record<string, unknown>) => {
        inserted = p;
        return { select: () => ({ single: async () => ({ data: { id: "lo1" }, error: null }) }) };
      },
    });
    const res = await createLabOrder("c1", { kind: "alineadores", labName: "Lab X", sentAt: "2026-08-10" });
    expect(res.ok).toBe(true);
    const w = inserted as unknown as { salon_id: string; customer_id: string; kind: string; sent_at: string };
    expect(w.salon_id).toBe("s1");
    expect(w.customer_id).toBe("c1");
    expect(w.kind).toBe("alineadores");
    expect(w.sent_at).toBe("2026-08-10");
  });
});

describe("deleteLabOrder", () => {
  it("rechaza a staff (borrar es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue({ role: "staff" });
    const res = await deleteLabOrder("lo1");
    expect(res.ok).toBe(false);
  });
});
