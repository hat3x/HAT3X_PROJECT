/**
 * REPROGRAMAR (mover) la cita del cliente (`@/lib/reception/reschedule`).
 *
 * Cubre el movimiento con control de PERTENENCIA: `{ salonId, appointmentId, phone,
 * newStartsAt, newProfessionalId? }` → mueve SOLO si la cita es del cliente de ese
 * teléfono, DELEGANDO el hueco en el motor. Contratos que se prueban:
 *
 *   · ORDEN de comprobaciones: existencia ANTES que titularidad. Cita inexistente ⇒
 *     `APPOINTMENT_NOT_FOUND` (404) sin mirar de quién es ni llamar al motor.
 *   · TITULARIDAD (403 `NOT_YOUR_APPOINTMENT`): teléfono sin número real, sin ficha, o de
 *     OTRO cliente ⇒ nunca se mueve la cita de un tercero (ni se llama al motor).
 *   · SEMÁNTICA de `newProfessionalId`: ausente ⇒ mantiene el profesional ACTUAL; `"any"`
 *     y un uuid concreto se pasan tal cual al motor.
 *   · DELEGACIÓN: se reutiliza el motor (`reschedule`) con el `serviceId` de la cita y el
 *     destino resuelto; la confirmación se aplana al contrato de recepción (snake_case).
 *   · TRADUCCIÓN de errores del motor: `409 → SLOT_TAKEN`, `404 → NO_AVAILABILITY`, resto
 *     `→ INTERNAL_ERROR` sin filtrar la causa.
 *   · AISLAMIENTO multi-tenant (lo crítico): el `salon_id` recibido viaja en las lecturas
 *     (cita, ficha) Y como primer argumento del motor.
 *   · REUTILIZA `normalizePhone`: la ficha se busca por la forma canónica E.164.
 *
 * Se inyecta un cliente admin FALSO que enruta las lecturas de `appointments` y
 * `customers` (ambas por `maybeSingle`), y un motor FALSO (`reschedule`) para no montar la
 * BD ni recomputar disponibilidad real: aquí se prueba la ORQUESTACIÓN de recepción, no el
 * movimiento en sí (que cubren los `booking-*` de integración).
 */
import { describe, it, expect, vi } from "vitest";

import { BookingError } from "@/lib/booking/server";
import type { BookingConfirmation } from "@/lib/booking/types";
import { ReceptionError } from "@/lib/reception/errors";
import {
  rescheduleAppointment,
  type RescheduleAppointmentDeps,
} from "@/lib/reception/reschedule";

// -----------------------------------------------------------------------------
// Cliente admin FALSO — appointments (read) y customers (read).
// -----------------------------------------------------------------------------

type Admin = NonNullable<RescheduleAppointmentDeps["admin"]>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

/** Una lectura capturada: columnas proyectadas y filtros aplicados. */
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
}

interface FakeConfig {
  /** Resultado de la lectura de la cita por `(salon_id, id)` en `appointments`. */
  appointment?: QueryResult;
  /** Resultado de la búsqueda de ficha por `(salon_id, phone_e164)` en `customers`. */
  customer?: QueryResult;
}

/**
 * Cliente admin falso. `from("appointments")` sirve la lectura de contexto
 * `.select().eq().eq().maybeSingle()`; `from("customers")` sirve
 * `.select().eq().eq().maybeSingle()`. Cada terminal registra su llamada para auditar
 * columnas y filtros (el aislamiento por salón).
 */
function fakeAdmin(config: FakeConfig): {
  admin: Admin;
  appointmentReads: SelectCall[];
  customerCalls: SelectCall[];
} {
  const appointmentReads: SelectCall[] = [];
  const customerCalls: SelectCall[] = [];

  const client = {
    from(table: string) {
      if (table === "appointments") {
        let columns = "";
        const filters: Record<string, unknown> = {};
        const builder = {
          select(cols: string) {
            columns = cols;
            return builder;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return builder;
          },
          maybeSingle() {
            appointmentReads.push({ columns, filters: { ...filters } });
            return Promise.resolve(config.appointment ?? { data: null, error: null });
          },
        };
        return builder;
      }
      if (table === "customers") {
        let columns = "";
        const filters: Record<string, unknown> = {};
        const builder = {
          select(cols: string) {
            columns = cols;
            return builder;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return builder;
          },
          maybeSingle() {
            customerCalls.push({ columns, filters: { ...filters } });
            return Promise.resolve(config.customer ?? { data: null, error: null });
          },
        };
        return builder;
      }
      throw new Error(`fakeAdmin: tabla inesperada '${table}'`);
    },
  };

  return { admin: client as unknown as Admin, appointmentReads, customerCalls };
}

/** Motor FALSO inyectable como `deps.reschedule`. */
function fakeReschedule() {
  return vi.fn() as unknown as NonNullable<RescheduleAppointmentDeps["reschedule"]> & {
    mock: { calls: unknown[][] };
    mockResolvedValue: (v: BookingConfirmation) => void;
    mockRejectedValue: (e: unknown) => void;
  };
}

/** Captura el `ReceptionError` que lanza `rescheduleAppointment` (o `null` si no lanzó). */
async function catchReceptionError(
  promise: Promise<unknown>,
): Promise<ReceptionError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ReceptionError) return error;
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Fixtures (sintéticos)
// -----------------------------------------------------------------------------

const SALON = "salon-9";
const APPT_ID = "apt-1";
const CUSTOMER_ID = "cust-1";
const SERVICE_ID = "svc-1";
const CURRENT_PROF = "prof-actual";
const NEW_STARTS_AT = "2026-07-25T10:00:00.000Z";
const NEW_ENDS_AT = "2026-07-25T11:00:00.000Z";
const OTHER_PROF = "22222222-2222-2222-2222-222222222222";

/** La cita existe en el salón, es de `cust-1`, con servicio `svc-1` y profesional actual. */
const APPOINTMENT_ROW: QueryResult = {
  data: {
    id: APPT_ID,
    customer_id: CUSTOMER_ID,
    service_id: SERVICE_ID,
    professional_id: CURRENT_PROF,
  },
  error: null,
};

/** La ficha del teléfono ES la dueña de la cita. */
const CUSTOMER_MATCH: QueryResult = { data: { id: CUSTOMER_ID }, error: null };

/** La ficha del teléfono es OTRO cliente (no el de la cita). */
const CUSTOMER_OTHER: QueryResult = { data: { id: "cust-OTRO" }, error: null };

/** Confirmación que devuelve el motor tras mover la cita. */
const CONFIRMATION: BookingConfirmation = {
  appointmentId: APPT_ID,
  startsAt: NEW_STARTS_AT,
  endsAt: NEW_ENDS_AT,
  professionalName: "Marta",
  serviceName: "Corte",
  salonName: "Salón Nueve",
};

// -----------------------------------------------------------------------------
// Camino feliz — delega en el motor y aplana el contrato
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — mueve (camino feliz)", () => {
  it("newProfessionalId AUSENTE ⇒ mantiene el profesional actual; delega y aplana", async () => {
    const { admin, appointmentReads, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
    });
    const reschedule = fakeReschedule();
    reschedule.mockResolvedValue(CONFIRMATION);

    const result = await rescheduleAppointment(
      SALON,
      APPT_ID,
      "612 34 56 78",
      NEW_STARTS_AT,
      undefined,
      { admin, reschedule },
    );

    // Aplana la confirmación del motor al contrato de recepción (snake_case).
    expect(result).toEqual({
      id: APPT_ID,
      starts_at: NEW_STARTS_AT,
      ends_at: NEW_ENDS_AT,
      service_name: "Corte",
      professional_name: "Marta",
      salon_name: "Salón Nueve",
    });

    // Localizó la cita por (salon_id, id) proyectando lo que ownership/motor necesitan.
    expect(appointmentReads).toHaveLength(1);
    expect(appointmentReads[0]!.filters).toEqual({ salon_id: SALON, id: APPT_ID });
    expect(appointmentReads[0]!.columns).toContain("service_id");
    expect(appointmentReads[0]!.columns).toContain("professional_id");

    // Verificó titularidad por la ficha del teléfono canónico.
    expect(customerCalls).toHaveLength(1);
    expect(customerCalls[0]!.filters).toEqual({
      salon_id: SALON,
      phone_e164: "+34612345678",
    });

    // Delegó UNA vez con el serviceId de la cita y el profesional ACTUAL como destino.
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule).toHaveBeenCalledWith(SALON, {
      appointmentId: APPT_ID,
      serviceId: SERVICE_ID,
      startsAt: NEW_STARTS_AT,
      professionalId: CURRENT_PROF,
    });
  });

  it("newProfessionalId 'any' se pasa tal cual al motor (reasignar)", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    reschedule.mockResolvedValue(CONFIRMATION);

    await rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, "any", {
      admin,
      reschedule,
    });

    expect(reschedule).toHaveBeenCalledWith(
      SALON,
      expect.objectContaining({ professionalId: "any" }),
    );
  });

  it("newProfessionalId uuid concreto se pasa tal cual al motor", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    reschedule.mockResolvedValue(CONFIRMATION);

    await rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, OTHER_PROF, {
      admin,
      reschedule,
    });

    expect(reschedule).toHaveBeenCalledWith(
      SALON,
      expect.objectContaining({ professionalId: OTHER_PROF }),
    );
  });
});

// -----------------------------------------------------------------------------
// APPOINTMENT_NOT_FOUND (404) — existencia antes que titularidad
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — 404 APPOINTMENT_NOT_FOUND", () => {
  it("cita inexistente en el salón ⇒ 404 y NO mira titularidad ni llama al motor", async () => {
    const { admin, customerCalls } = fakeAdmin({ appointment: { data: null, error: null } });
    const reschedule = fakeReschedule();

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
    expect(customerCalls).toHaveLength(0);
    expect(reschedule).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// NOT_YOUR_APPOINTMENT (403) — la cita existe pero no es de ese teléfono
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — 403 NOT_YOUR_APPOINTMENT", () => {
  it("teléfono sin número real ⇒ 403 sin consultar la ficha ni mover", async () => {
    const { admin, appointmentReads, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
    });
    const reschedule = fakeReschedule();

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "sin teléfono", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(appointmentReads).toHaveLength(1);
    expect(customerCalls).toHaveLength(0);
    expect(reschedule).not.toHaveBeenCalled();
  });

  it("ningún cliente con ese teléfono ⇒ 403 sin mover", async () => {
    const { admin, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: { data: null, error: null },
    });
    const reschedule = fakeReschedule();

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(customerCalls).toHaveLength(1);
    expect(reschedule).not.toHaveBeenCalled();
  });

  it("la cita es de OTRO cliente ⇒ 403 sin mover", async () => {
    const { admin } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_OTHER,
    });
    const reschedule = fakeReschedule();

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(reschedule).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Traducción de errores del motor al contrato de recepción
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — traduce los errores del motor", () => {
  it("hueco ya no disponible / carrera anti-solape (BookingError 409) ⇒ 409 SLOT_TAKEN", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    reschedule.mockRejectedValue(
      new BookingError(409, "Ese horario ya no está disponible. Elige otro."),
    );

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "SLOT_TAKEN", status: 409 });
  });

  it("servicio inexistente/inactivo (BookingError 404) ⇒ 409 NO_AVAILABILITY", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    reschedule.mockRejectedValue(new BookingError(404, "Servicio no disponible."));

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "NO_AVAILABILITY", status: 409 });
  });

  it("fallo de escritura (BookingError 500) ⇒ 500 INTERNAL_ERROR, causa guardada y no filtrada", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    const cause = new BookingError(500, "No se pudo mover la cita.");
    reschedule.mockRejectedValue(cause);

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.cause).toBe(cause);
    expect(error?.message).not.toContain("mover la cita");
  });

  it("un throw inesperado (no BookingError) ⇒ 500 INTERNAL_ERROR sin filtrar el detalle", async () => {
    const { admin } = fakeAdmin({ appointment: APPOINTMENT_ROW, customer: CUSTOMER_MATCH });
    const reschedule = fakeReschedule();
    const boom = new Error("postgres: relation appointments 42P01");
    reschedule.mockRejectedValue(boom);

    const error = await catchReceptionError(
      rescheduleAppointment(SALON, APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
        admin,
        reschedule,
      }),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.cause).toBe(boom);
    expect(error?.message).not.toContain("42P01");
  });
});

// -----------------------------------------------------------------------------
// Aislamiento multi-tenant — el salon_id viaja en TODAS las operaciones
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — aislamiento por salón (nunca toca otro salón)", () => {
  it("acota por el salon_id recibido en lectura de cita, ficha y llamada al motor", async () => {
    const { admin, appointmentReads, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
    });
    const reschedule = fakeReschedule();
    reschedule.mockResolvedValue(CONFIRMATION);

    await rescheduleAppointment("salon-OTRO", APPT_ID, "612345678", NEW_STARTS_AT, undefined, {
      admin,
      reschedule,
    });

    expect(appointmentReads[0]!.filters.salon_id).toBe("salon-OTRO");
    expect(customerCalls[0]!.filters.salon_id).toBe("salon-OTRO");
    expect(reschedule.mock.calls[0]![0]).toBe("salon-OTRO");
  });
});

// -----------------------------------------------------------------------------
// normalizePhone — la ficha se busca por la forma canónica E.164
// -----------------------------------------------------------------------------

describe("rescheduleAppointment — reutiliza normalizePhone (busca por E.164 canónico)", () => {
  it.each([
    ["612345678", "+34612345678"],
    ["+34 612 34 56 78", "+34612345678"],
    ["0034612345678", "+34612345678"],
    ["(612) 345-678", "+34612345678"],
  ])("normaliza %s → %s antes de comprobar titularidad", async (input, canonical) => {
    const { admin, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
    });
    const reschedule = fakeReschedule();
    reschedule.mockResolvedValue(CONFIRMATION);

    await rescheduleAppointment(SALON, APPT_ID, input, NEW_STARTS_AT, undefined, {
      admin,
      reschedule,
    });

    expect(customerCalls[0]!.filters.phone_e164).toBe(canonical);
  });
});
