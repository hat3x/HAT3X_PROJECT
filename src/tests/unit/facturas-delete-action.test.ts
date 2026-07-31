/**
 * Server Action de BORRAR factura (`app/(dashboard)/facturacion/facturas/actions`).
 *
 * Verifactu retirado ⇒ una factura es un registro normal y se puede eliminar. Aquí se
 * blindan las reglas del wrapper de acción, mockeando `@/lib/salon`, el cliente Supabase
 * y `next/cache` (no se arrastra red ni caché):
 *
 *   · id vacío ⇒ "Factura no válida." (ni siquiera consulta membership);
 *   · sin salón asignado ⇒ error legible;
 *   · rol distinto de owner/manager ⇒ "No tienes permiso para borrar facturas.";
 *   · owner/manager + fila borrada ⇒ { ok:true };
 *   · id inexistente/ajeno (delete afecta 0 filas) ⇒ "no existe o no es accesible".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { membershipMock, maybeSingleMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveMembership: () => membershipMock(),
  canManageSettings: (role: MemberRole | null | undefined) =>
    role === "owner" || role === "manager",
}));

vi.mock("@/lib/supabase/server", () => {
  const chain = {
    delete: () => chain,
    eq: () => chain,
    select: () => chain,
    maybeSingle: () => maybeSingleMock(),
  };
  return { createClient: () => ({ from: () => chain }) };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteInvoiceAction } from "@/app/(dashboard)/facturacion/facturas/actions";

const SALON = "00000000-0000-0000-0000-000000000000";
const INVOICE = "11111111-1111-1111-1111-111111111111";

function membership(role: MemberRole): void {
  membershipMock.mockResolvedValue({ salonId: SALON, role });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteInvoiceAction", () => {
  it("rechaza un id vacío sin consultar la sesión", async () => {
    const result = await deleteInvoiceAction("   ");
    expect(result).toEqual({ ok: false, error: "Factura no válida." });
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it("falla si el usuario no tiene salón asignado", async () => {
    membershipMock.mockResolvedValue(null);
    const result = await deleteInvoiceAction(INVOICE);
    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
  });

  it("deniega a un rol sin permisos de gestión (staff)", async () => {
    membership("staff");
    const result = await deleteInvoiceAction(INVOICE);
    expect(result).toEqual({
      ok: false,
      error: "No tienes permiso para borrar facturas.",
    });
    // No debe tocar la BD si el rol no puede.
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("borra la factura para un owner y devuelve su id", async () => {
    membership("owner");
    maybeSingleMock.mockResolvedValue({ data: { id: INVOICE }, error: null });
    const result = await deleteInvoiceAction(INVOICE);
    expect(result).toEqual({ ok: true, data: { id: INVOICE } });
  });

  it("informa cuando la factura no existe o es de otro salón (0 filas)", async () => {
    membership("manager");
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const result = await deleteInvoiceAction(INVOICE);
    expect(result).toEqual({
      ok: false,
      error: "La factura no existe o no es accesible.",
    });
  });

  it("opaca un error de BD con un mensaje genérico", async () => {
    membership("owner");
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom interno" } });
    const result = await deleteInvoiceAction(INVOICE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("No se pudo borrar la factura. Inténtalo de nuevo.");
      expect(result.error).not.toContain("boom");
    }
  });
});
