import { beforeEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ supabase: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.supabase }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve("SALON") }));
import { makeSupabaseMock } from "@/tests/helpers/supabase-mock";
import { sendOrderToStations, setOrderItemStatus } from "@/app/(dashboard)/mostrador/actions";

beforeEach(() => { holder.supabase = null; });

// Mismos uuids que `restauracion-order-actions.test.ts` (los ids de ejemplo
// del brief, "O1"/"i1", no son UUIDs válidos y no pasarían `safeParse` —
// `sendOrderToStationsSchema`/`setOrderItemStatusSchema` exigen `.uuid()`).
const ORDER_ID_1 = "11111111-1111-4111-8111-111111111111";
const ITEM_ID_1 = "44444444-4444-4444-8444-444444444444";

describe("order status actions", () => {
  it("setOrderItemStatus da CONFLICTO si el estado esperado ya cambió", async () => {
    holder.supabase = makeSupabaseMock({ onWrite: (op: string) => op === "update" ? { data: [] } : {} });
    const r = await setOrderItemStatus({ itemId: ITEM_ID_1, from: "enviado", to: "listo" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("conflicto");
  });

  it("setOrderItemStatus transiciona el ítem cuando el estado esperado coincide", async () => {
    const onWrite = vi.fn((op: string) =>
      op === "update"
        ? { data: [{ id: ITEM_ID_1, salon_id: "SALON", order_id: ORDER_ID_1, status: "listo" }] }
        : {},
    );
    holder.supabase = makeSupabaseMock({ onWrite });
    const r = await setOrderItemStatus({ itemId: ITEM_ID_1, from: "enviado", to: "listo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("listo");
    expect(onWrite).toHaveBeenCalledWith("update", "order_items", { status: "listo" });
  });

  it("sendOrderToStations cuenta las líneas pendientes que pasan a enviado", async () => {
    holder.supabase = makeSupabaseMock({
      onWrite: (op: string) =>
        op === "update"
          ? { data: [{ id: ITEM_ID_1 }, { id: "88888888-8888-4888-8888-888888888888" }] }
          : {},
    });
    const r = await sendOrderToStations({ orderId: ORDER_ID_1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.sent).toBe(2);
  });

  it("sendOrderToStations devuelve 0 si no había líneas pendientes", async () => {
    holder.supabase = makeSupabaseMock({ onWrite: (op: string) => (op === "update" ? { data: [] } : {}) });
    const r = await sendOrderToStations({ orderId: ORDER_ID_1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.sent).toBe(0);
  });

  // Ronda de fix (revisión final del Plan B, Important financiero): 'anulado'
  // es TERMINAL — solo `voidOrderItem` lo fija (append-only, con fila de
  // auditoría). Sin esta guarda, `from:'anulado'` reanimaría una línea ya
  // anulada (quitándole `status:'anulado'` sin tocar `void_of_item_id`, que
  // quedaría huérfano) y `settleOrder` la volvería a cobrar. Se rechaza ANTES
  // de tocar la BD: `onWrite` no debe recibir ninguna llamada de tipo
  // "update".
  it("setOrderItemStatus rechaza from:'anulado' sin tocar la BD (no se puede reanimar una línea anulada)", async () => {
    const onWrite = vi.fn(() => ({ data: [] }));
    holder.supabase = makeSupabaseMock({ onWrite });
    const r = await setOrderItemStatus({ itemId: ITEM_ID_1, from: "anulado", to: "pendiente" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("anulado");
    expect(onWrite).not.toHaveBeenCalledWith("update", expect.anything(), expect.anything());
  });

  // Simétrico: tampoco se puede anular POR ESTA VÍA (to:'anulado') —
  // saltaría el registro de auditoría de `voidOrderItem` (sin `void_reason`
  // ni fila `void_of_item_id`).
  it("setOrderItemStatus rechaza to:'anulado' sin tocar la BD (anular pasa por voidOrderItem)", async () => {
    const onWrite = vi.fn(() => ({ data: [] }));
    holder.supabase = makeSupabaseMock({ onWrite });
    const r = await setOrderItemStatus({ itemId: ITEM_ID_1, from: "listo", to: "anulado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("anulado");
    expect(onWrite).not.toHaveBeenCalledWith("update", expect.anything(), expect.anything());
  });
});
