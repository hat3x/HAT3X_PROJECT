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
import { openTable, setTableStatus } from "@/app/(dashboard)/sala/actions";

beforeEach(() => {
  holder.membership = { salonId: "SALON", role: "staff" };
  holder.supabase = null;
});

const TABLE_ID_1 = "11111111-1111-4111-8111-111111111111";

// ─────────────────────────────────────────────────────────────────────────────
// openTable: UPDATE-mesa-condicionado (libre→ocupada) → insert-order →
// (si falla) revertir mesa. Ver contrato en el brief de la Task 5.
// ─────────────────────────────────────────────────────────────────────────────

describe("sala actions — openTable", () => {
  it("rechaza si la mesa NO está libre (UPDATE condicionado afecta 0 filas), sin insertar order", async () => {
    const onWrite = vi.fn((op: string) => (op === "update" ? { data: [] } : {}));
    holder.supabase = makeSupabaseMock({ onWrite });

    const r = await openTable({ tableId: TABLE_ID_1, covers: 2 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no está libre");
    expect(onWrite).not.toHaveBeenCalledWith("insert", "orders", expect.anything());
  });

  it("abre la mesa y crea la cuenta cuando está libre", async () => {
    const onWrite = vi.fn((op: string, table: string) => {
      if (op === "update" && table === "dining_tables") {
        return { data: [{ id: TABLE_ID_1, salon_id: "SALON", status: "ocupada", name: "Mesa 3" }] };
      }
      if (op === "insert" && table === "orders") {
        return {
          data: [
            {
              id: "99999999-9999-4999-8999-999999999999",
              salon_id: "SALON",
              channel: "mesa",
              dining_table_id: TABLE_ID_1,
              covers: 2,
              label: "Mesa 3",
              status: "abierta",
            },
          ],
        };
      }
      return {};
    });
    holder.supabase = makeSupabaseMock({ onWrite });

    const r = await openTable({ tableId: TABLE_ID_1, covers: 2 });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe("abierta");
      expect(r.data.dining_table_id).toBe(TABLE_ID_1);
      expect(r.data.label).toBe("Mesa 3");
    }
    expect(onWrite).toHaveBeenCalledWith("update", "dining_tables", { status: "ocupada" });
    expect(onWrite).toHaveBeenCalledWith(
      "insert",
      "orders",
      expect.objectContaining({ channel: "mesa", dining_table_id: TABLE_ID_1, covers: 2, label: "Mesa 3" }),
    );
  });

  it("revierte la mesa a libre si el insert del pedido falla (compensación manual)", async () => {
    const onWrite = vi.fn((op: string, table: string) => {
      if (op === "update" && table === "dining_tables") {
        return { data: [{ id: TABLE_ID_1, salon_id: "SALON", status: "ocupada", name: "Mesa 3" }] };
      }
      if (op === "insert" && table === "orders") {
        return { error: { message: "boom" } };
      }
      return {};
    });
    holder.supabase = makeSupabaseMock({ onWrite });

    const r = await openTable({ tableId: TABLE_ID_1, covers: 2 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("boom");
    expect(onWrite).toHaveBeenCalledWith("update", "dining_tables", { status: "libre" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setTableStatus: canTransition ANTES de tocar BD; UPDATE condicionado por
// status = from; 0 filas ⇒ CONFLICTO (misma seguridad de concurrencia que
// `setOrderItemStatus`, mostrador/actions.ts).
// ─────────────────────────────────────────────────────────────────────────────

describe("sala actions — setTableStatus", () => {
  it("da CONFLICTO cuando el UPDATE condicionado afecta 0 filas", async () => {
    const onWrite = vi.fn(() => ({ data: [] }));
    holder.supabase = makeSupabaseMock({ onWrite });

    const r = await setTableStatus({ tableId: TABLE_ID_1, from: "ocupada", to: "por_limpiar" });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("conflicto");
  });

  it("rechaza transición inválida sin tocar BD", async () => {
    const onWrite = vi.fn(() => ({}));
    holder.supabase = makeSupabaseMock({ onWrite });

    const r = await setTableStatus({ tableId: TABLE_ID_1, from: "libre", to: "por_limpiar" });

    expect(r.ok).toBe(false);
    expect(onWrite).not.toHaveBeenCalledWith("update", expect.anything(), expect.anything());
  });
});
