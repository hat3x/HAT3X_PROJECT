/**
 * Server action `sendRecallReminder` (`app/(dashboard)/recordatorios/recall-actions`).
 *
 * Mismo patrón que `planes-actions.test.ts` / `appointment-reminder-actions.test.ts`:
 * se mockea `@/lib/salon` y `@/lib/supabase/server` (chain "then-able"). Se mockea
 * `sendRevisionReminder`; `summarizeSendResult` se mantiene REAL.
 *
 * Sin gate de sector: solo gate de rol.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, sendRevisionReminderMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    fromMock: vi.fn(),
    sendRevisionReminderMock: vi.fn(),
  }));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
  }),
}));

vi.mock("@/lib/whatsapp/reminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/reminders")>();
  return {
    ...actual,
    sendRevisionReminder: sendRevisionReminderMock,
  };
});

import { sendRecallReminder } from "@/app/(dashboard)/recordatorios/recall-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

const SALON = {
  id: SALON_ID,
  name: "Salón de prueba",
  slug: "salon-prueba",
  timezone: "Europe/Madrid",
  sector: "peluqueria" as const,
};

/** Chain de Supabase encadenable y "then-able", igual que en `planes-actions.test.ts`. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function membership(role: MemberRole): void {
  getActiveMembershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveSalonMock.mockResolvedValue(SALON);
  sendRevisionReminderMock.mockResolvedValue({
    sent: false,
    dryRun: true,
    reason: "disabled",
    to: "+34611111111",
    logText: "texto de prueba",
  });
});

describe("sendRecallReminder — gate", () => {
  it("sin salón asignado ⇒ { ok:false } sin tocar la BD ni WhatsApp", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(fromMock).not.toHaveBeenCalled();
    expect(sendRevisionReminderMock).not.toHaveBeenCalled();
  });

  it("sin membresía activa ⇒ { ok:false }", async () => {
    getActiveMembershipMock.mockResolvedValue(null);

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("sendRecallReminder — (a) cliente sin teléfono", () => {
  it("devuelve error legible y NO llama a sendRevisionReminder", async () => {
    membership("staff");
    fromMock.mockImplementation(() =>
      chain({ data: { full_name: "Ana García", phone: null }, error: null }),
    );

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(result).toEqual({
      ok: false,
      error: "El paciente no tiene teléfono para enviarle el recordatorio.",
    });
    expect(sendRevisionReminderMock).not.toHaveBeenCalled();
  });
});

describe("sendRecallReminder — (b) cliente con teléfono", () => {
  it("llama a sendRevisionReminder con el input correcto", async () => {
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "customers") {
        return chain({ data: { full_name: "Ana García", phone: "+34611111111" }, error: null });
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(fromMock).toHaveBeenCalledWith("customers");
    expect(sendRevisionReminderMock).toHaveBeenCalledWith({
      customerPhone: "+34611111111",
      customerName: "Ana García",
      salonName: "Salón de prueba",
    });
    expect(result.ok).toBe(true);
  });

  it("propaga el mensaje resumido de un envío real (sent:true)", async () => {
    membership("manager");
    fromMock.mockImplementation(() =>
      chain({ data: { full_name: "Ana García", phone: "+34611111111" }, error: null }),
    );
    sendRevisionReminderMock.mockResolvedValue({
      sent: true,
      dryRun: false,
      messageSid: "SM999",
      to: "+34611111111",
    });

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(result).toEqual({
      ok: true,
      data: { message: "✅ Enviado a +34611111111 (SID: SM999)" },
    });
  });

  it("error de la consulta del cliente se opaca como { ok:false }", async () => {
    membership("staff");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await sendRecallReminder(CUSTOMER_ID);

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(sendRevisionReminderMock).not.toHaveBeenCalled();
  });
});

describe("sendRecallReminder — roles", () => {
  it.each<MemberRole>(["owner", "manager", "staff"])(
    "rol %s puede enviar el recordatorio de revisión",
    async (role) => {
      membership(role);
      fromMock.mockImplementation(() =>
        chain({ data: { full_name: "Ana García", phone: "+34611111111" }, error: null }),
      );

      const result = await sendRecallReminder(CUSTOMER_ID);

      expect(result.ok).toBe(true);
    },
  );
});
