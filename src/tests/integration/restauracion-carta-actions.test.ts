import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ supabase: null as unknown, membership: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({
  getActiveSalonId: () => Promise.resolve("SALON"),
  getActiveMembership: () => Promise.resolve(holder.membership),
  canManageSettings: (r: string | null | undefined) => r === "owner" || r === "manager",
}));

import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { createCategory, createMenuProduct } from "@/app/(dashboard)/carta/actions";

beforeEach(() => { holder.membership = { salonId: "SALON", role: "owner" }; holder.supabase = null; });

describe("carta actions", () => {
  it("owner crea categoría", async () => {
    holder.supabase = makeSupabaseMock({
      onWrite: (op: string, table: string) =>
        op === "insert" && table === "menu_categories"
          ? { data: [{ id: "C1", salon_id: "SALON", name: "Bebidas", sort_order: 0, active: true }] }
          : {},
    });
    const r = await createCategory({ name: "Bebidas", sortOrder: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("C1");
  });

  it("staff NO puede crear categoría (gate de rol)", async () => {
    holder.membership = { salonId: "SALON", role: "staff" };
    holder.supabase = makeSupabaseMock({});
    const r = await createCategory({ name: "Bebidas", sortOrder: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("permiso");
  });

  it("rechaza precio negativo en producto (Zod)", async () => {
    holder.supabase = makeSupabaseMock({});
    const r = await createMenuProduct({
      name: "Café", priceCents: -1, vatRate: 10, categoryId: null, stationId: null,
      allergens: [], isCombo: false, imageUrl: null,
    });
    expect(r.ok).toBe(false);
  });
});
