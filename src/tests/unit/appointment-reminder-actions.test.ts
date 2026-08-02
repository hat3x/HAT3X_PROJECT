/**
 * Server action `sendAppointmentReminder` (`app/(dashboard)/appointments/reminder-actions`).
 *
 * Mismo patrón que `planes-actions.test.ts`: se mockea `@/lib/salon`
 * (getActiveSalon + getActiveMembership) y `@/lib/supabase/server`
 * (chain encadenable "then-able"). `sendSms` se mockea; `summarizeSmsResult`
 * se mantiene REAL (función pura) para verificar el mensaje legible de verdad.
 *
 * SMS (Twilio Messages API) en vez de WhatsApp: Biodental no tiene WhatsApp
 * configurado, así que los recordatorios replican el mecanismo SMS que ya usa
 * su recepcionista de voz "Sara".
 *
 * Sin gate de sector (a diferencia de planes): solo gate de rol.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, sendSmsMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    fromMock: vi.fn(),
    sendSmsMock: vi.fn(),
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

vi.mock("@/lib/sms/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sms/client")>();
  return {
    ...actual,
    sendSms: sendSmsMock,
  };
});

import { sendAppointmentReminder } from "@/app/(dashboard)/appointments/reminder-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";

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

function appointmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    starts_at: "2026-08-15T09:00:00.000Z",
    price_cents: 3000,
    currency: "EUR",
    customer: { full_name: "Ana García", phone: "+34611111111" },
    professional: { full_name: "Marta López" },
    service: { name: "Corte y peinado" },
    salon: { phone: "+34900000000" },
    ...overrides,
  };
}

function membership(role: MemberRole): void {
  getActiveMembershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveSalonMock.mockResolvedValue(SALON);
  sendSmsMock.mockResolvedValue({
    sent: false,
    dryRun: true,
    reason: "disabled",
    to: "+34611111111",
    logText: "texto de prueba",
  });
});

describe("sendAppointmentReminder — gate", () => {
  it("sin salón asignado ⇒ { ok:false } sin tocar la BD ni SMS", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result).toEqual({ ok: false, error: "No tienes un salón asignado." });
    expect(fromMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("sin membresía activa ⇒ { ok:false }", async () => {
    getActiveMembershipMock.mockResolvedValue(null);

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("sendAppointmentReminder — (a) cliente sin teléfono", () => {
  it("devuelve error legible y NO llama a sendSms", async () => {
    membership("staff");
    fromMock.mockImplementation(() =>
      chain({ data: appointmentRow({ customer: { full_name: "Ana García", phone: null } }), error: null }),
    );

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result).toEqual({
      ok: false,
      error: "El paciente no tiene teléfono para enviarle el recordatorio.",
    });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe("sendAppointmentReminder — (b) cliente con teléfono", () => {
  it("llama a sendSms con el teléfono del cliente y un cuerpo de texto no vacío", async () => {
    membership("owner");
    fromMock.mockImplementation((table: string) => {
      if (table === "appointments") return chain({ data: appointmentRow(), error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(fromMock).toHaveBeenCalledWith("appointments");
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [to, body] = sendSmsMock.mock.calls[0] as [string, string];
    expect(to).toBe("+34611111111");
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("Ana García");
    expect(body).toContain("Salón de prueba");
    expect(body).toContain("Corte y peinado");
    expect(result.ok).toBe(true);
  });

  it("propaga el mensaje resumido de un envío real (sent:true)", async () => {
    membership("manager");
    fromMock.mockImplementation(() => chain({ data: appointmentRow(), error: null }));
    sendSmsMock.mockResolvedValue({
      sent: true,
      dryRun: false,
      messageSid: "SM123",
      to: "+34611111111",
    });

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result).toEqual({
      ok: true,
      data: { message: "Enviado ✓" },
    });
  });

  it("propaga el mensaje resumido de un dry-run", async () => {
    membership("manager");
    fromMock.mockImplementation(() => chain({ data: appointmentRow(), error: null }));
    sendSmsMock.mockResolvedValue({
      sent: false,
      dryRun: true,
      reason: "disabled",
      to: "+34611111111",
      logText: "texto",
    });

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toContain("Modo prueba");
    }
  });

  it("error de la consulta de la cita se opaca como { ok:false }", async () => {
    membership("staff");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await sendAppointmentReminder(APPOINTMENT_ID);

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe("sendAppointmentReminder — roles", () => {
  it.each<MemberRole>(["owner", "manager", "staff"])(
    "rol %s puede enviar el recordatorio",
    async (role) => {
      membership(role);
      fromMock.mockImplementation(() => chain({ data: appointmentRow(), error: null }));

      const result = await sendAppointmentReminder(APPOINTMENT_ID);

      expect(result.ok).toBe(true);
    },
  );
});
