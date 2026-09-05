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
import {
  createCategory,
  createMenuProduct,
  saveCombo,
  setProductModifierGroups,
} from "@/app/(dashboard)/carta/actions";

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

// ─────────────────────────────────────────────────────────────────────────────
// Pre-validación de pertenencia al salón en setProductModifierGroups/saveCombo.
//
// El aislamiento real ya lo garantizan los FK compuestos (id, salon_id) de
// product_modifier_groups y combo_components — esto es PARIDAD con la
// convención de assertLocationInSalon/assertServicesInSalon
// (ajustes/personal/actions.ts): comprobar antes de escribir para devolver un
// mensaje amable en español en vez de un error crudo de constraint.
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID_1 = "22222222-2222-2222-2222-222222222222";
const GROUP_ID_2 = "33333333-3333-3333-3333-333333333333";
const COMPONENT_ID = "44444444-4444-4444-4444-444444444444";
const STATION_ID = "66666666-6666-6666-6666-666666666666";

describe("setProductModifierGroups — pertenencia al salón", () => {
  it("rechaza si el producto no pertenece al salón", async () => {
    holder.supabase = makeSupabaseMock({ tables: { products: { data: [] } } });
    const r = await setProductModifierGroups(PRODUCT_ID, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece a tu salón");
  });

  it("rechaza si algún grupo de modificadores no pertenece al salón", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        products: { data: [{ id: PRODUCT_ID }] },
        modifier_groups: { data: [{ id: GROUP_ID_1 }] }, // falta GROUP_ID_2
      },
    });
    const r = await setProductModifierGroups(PRODUCT_ID, [GROUP_ID_1, GROUP_ID_2]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece a tu salón");
  });

  it("guarda cuando el producto y los grupos pertenecen al salón (control positivo)", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        products: { data: [{ id: PRODUCT_ID }] },
        modifier_groups: { data: [{ id: GROUP_ID_1 }, { id: GROUP_ID_2 }] },
      },
    });
    const r = await setProductModifierGroups(PRODUCT_ID, [GROUP_ID_1, GROUP_ID_2]);
    expect(r.ok).toBe(true);
  });
});

describe("saveCombo — pertenencia al salón", () => {
  it("rechaza si alguna pieza del combo no pertenece al salón", async () => {
    holder.supabase = makeSupabaseMock({
      tables: { products: { data: [{ id: PRODUCT_ID }] } }, // falta COMPONENT_ID
    });
    const r = await saveCombo(PRODUCT_ID, [
      { componentProductId: COMPONENT_ID, qty: 1, stationIdOverride: null },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece a tu salón");
  });

  it("rechaza si la estación de ruteo de una pieza no pertenece al salón", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        products: { data: [{ id: PRODUCT_ID }, { id: COMPONENT_ID }] },
        stations: { data: [] }, // STATION_ID no aparece
      },
    });
    const r = await saveCombo(PRODUCT_ID, [
      { componentProductId: COMPONENT_ID, qty: 1, stationIdOverride: STATION_ID },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no pertenece a tu salón");
  });

  it("guarda el combo cuando piezas y estaciones pertenecen al salón (control positivo)", async () => {
    holder.supabase = makeSupabaseMock({
      tables: {
        products: { data: [{ id: PRODUCT_ID }, { id: COMPONENT_ID }] },
        stations: { data: [{ id: STATION_ID }] },
      },
    });
    const r = await saveCombo(PRODUCT_ID, [
      { componentProductId: COMPONENT_ID, qty: 1, stationIdOverride: STATION_ID },
    ]);
    expect(r.ok).toBe(true);
  });
});
