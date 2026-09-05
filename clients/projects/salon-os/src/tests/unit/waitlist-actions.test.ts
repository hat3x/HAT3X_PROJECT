/**
 * Server actions de LISTA DE ESPERA (`appointments/waitlist-actions`) — B3.
 *
 * Una decisión de producto que estos tests fijan: **la lista de espera NO está
 * limitada a odontología**. Un hueco que se pierde se pierde igual en una
 * peluquería o en un restaurante, y la tabla no tiene nada dental. Por eso aquí
 * hay gate de salón y de sesión, pero NO de sector — al revés que en
 * `expediente-actions`, donde el gate de sector sí es imprescindible.
 *
 * Y otra: apuntarse a la lista es operativa de mostrador, así que la puede hacer
 * cualquier miembro del salón, incluido `staff`. Exigir owner/manager obligaría
 * a molestar a la dueña cada vez que alguien pregunta "avísame si sale algo".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock } = vi.hoisted(() => ({
  getActiveSalonMock: vi.fn(),
  getActiveMembershipMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: (table: string) => fromMock(table) }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addToWaitlist, setWaitlistStatus } from "@/app/(dashboard)/appointments/waitlist-actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const ENTRY_ID = "55555555-5555-5555-5555-555555555555";

function salon(sector = "odontologia"): void {
  getActiveSalonMock.mockResolvedValue({
    id: SALON_ID,
    name: "Clínica de prueba",
    slug: "clinica-prueba",
    timezone: "Europe/Madrid",
    sector,
  });
}

function membership(role: MemberRole): void {
  getActiveMembershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    customerId: CUSTOMER_ID,
    serviceId: null,
    professionalId: null,
    weekdays: [1, 3],
    fromTime: "09:00",
    toTime: "14:00",
    priority: 0,
    notes: "Avisar por WhatsApp",
    expiresAt: null,
    ...overrides,
  };
}

function chain(
  result: { data: unknown; error: unknown },
  onWrite?: (payload: unknown) => void,
): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn((payload: unknown) => {
    onWrite?.(payload);
    return c;
  });
  c.update = vi.fn((payload: unknown) => {
    onWrite?.(payload);
    return c;
  });
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  salon();
  membership("staff");
});

describe("addToWaitlist — quién puede", () => {
  it("staff puede apuntar a alguien: es operativa de mostrador", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation(() => chain({ data: { id: ENTRY_ID }, error: null }, insertSpy));

    const result = await addToWaitlist(entry());

    expect(result.ok).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ salon_id: SALON_ID, customer_id: CUSTOMER_ID }),
    );
  });

  it("funciona fuera de odontología: un hueco perdido lo es en cualquier sector", async () => {
    salon("peluqueria");
    fromMock.mockImplementation(() => chain({ data: { id: ENTRY_ID }, error: null }));

    const result = await addToWaitlist(entry());

    expect(result.ok).toBe(true);
  });

  it("sin salón asignado ⇒ rechaza sin tocar la BD", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await addToWaitlist(entry());

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("addToWaitlist — validación", () => {
  it("rechaza una franja invertida sin tocar la BD", async () => {
    // De 16:00 a 09:00 no dejaría pasar a nadie y nadie entendería por qué.
    const result = await addToWaitlist(entry({ fromTime: "16:00", toTime: "09:00" }));

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rechaza un día de la semana que no existe", async () => {
    const result = await addToWaitlist(entry({ weekdays: [1, 9] }));

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("acepta a quien no pone ninguna preferencia: es el más fácil de encajar", async () => {
    fromMock.mockImplementation(() => chain({ data: { id: ENTRY_ID }, error: null }));

    const result = await addToWaitlist(
      entry({ weekdays: [], fromTime: null, toTime: null, serviceId: null }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("setWaitlistStatus", () => {
  it("marca la entrada acotando por salón", async () => {
    const eqCalls: unknown[][] = [];
    const c = chain({ data: { id: ENTRY_ID }, error: null });
    c.eq = vi.fn((...args: unknown[]) => {
      eqCalls.push(args);
      return c;
    });
    fromMock.mockImplementation(() => c);

    const result = await setWaitlistStatus(ENTRY_ID, "agendado");

    expect(result.ok).toBe(true);
    expect(eqCalls).toContainEqual(["salon_id", SALON_ID]);
    expect(eqCalls).toContainEqual(["id", ENTRY_ID]);
  });

  it("rechaza un estado que no existe", async () => {
    const result = await setWaitlistStatus(ENTRY_ID, "inventado");

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
