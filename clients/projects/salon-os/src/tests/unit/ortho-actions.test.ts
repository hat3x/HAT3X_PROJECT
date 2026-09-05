import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, getUserMock } =
  vi.hoisted(() => ({
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveOrthoData } from "@/app/(dashboard)/ortodoncia/actions";

function asRole(role: MemberRole) {
  return { role };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("saveOrthoData", () => {
  it("rechaza si el salón no es odontología", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "peluqueria" });
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("rechaza a staff (ficha es owner/manager)", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("staff"));
    const res = await saveOrthoData("c1", { ficha: {}, treatment: {} });
    expect(res.ok).toBe(false);
  });

  it("hace merge preservando otras claves de data", async () => {
    getActiveSalonMock.mockResolvedValue({ id: "s1", sector: "odontologia" });
    getActiveMembershipMock.mockResolvedValue(asRole("owner"));

    let upsertPayload: Record<string, unknown> | null = null;
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("clinical_records");
      return {
        // read chain: .select().eq().eq().maybeSingle()
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { data: { last_xray_at: "2026-01-01", ortho: { ficha: {} } } },
                error: null,
              }),
            }),
          }),
        }),
        // write chain: .upsert()
        upsert: (payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return Promise.resolve({ error: null });
        },
      };
    });

    const res = await saveOrthoData("c1", {
      ficha: { malocclusionClass: "I" },
      treatment: { status: "activo" },
    });

    expect(res.ok).toBe(true);
    const written = upsertPayload as unknown as { data: Record<string, unknown> };
    expect(written.data.last_xray_at).toBe("2026-01-01"); // clave ajena preservada
    expect(
      (written.data.ortho as { ficha: { malocclusionClass: string } }).ficha.malocclusionClass,
    ).toBe("I");
  });
});
