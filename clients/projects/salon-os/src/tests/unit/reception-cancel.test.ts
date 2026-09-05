/**
 * CANCELAR la cita del cliente (`@/lib/reception/cancel`).
 *
 * Cubre la anulación con control de PERTENENCIA: `{ salonId, appointmentId, phone }` →
 * cancela SOLO si la cita es del cliente de ese teléfono. Contratos que se prueban:
 *
 *   · ORDEN de comprobaciones: existencia ANTES que titularidad. Cita inexistente ⇒
 *     `APPOINTMENT_NOT_FOUND` (404) sin mirar de quién es ni escribir nada.
 *   · TITULARIDAD (403 `NOT_YOUR_APPOINTMENT`): teléfono sin número real, sin ficha, o de
 *     OTRO cliente ⇒ nunca se cancela la cita de un tercero (ni se escribe).
 *   · CANCELACIÓN: marca `status='cancelled'` + `cancelled_reason` acotando por
 *     `(salon_id, id)` y devuelve la cita aplanada.
 *   · AISLAMIENTO multi-tenant (lo crítico): el `salon_id` recibido viaja en TODAS las
 *     operaciones —leer la cita, resolver la ficha por teléfono y escribir la cancelación—.
 *   · REUTILIZA `normalizePhone`: la ficha se busca por la forma canónica E.164.
 *   · Embeds robustos: servicio/profesional ausente ⇒ `null` (no rompe ni inventa `""`).
 *   · Fallo REAL de consulta ⇒ `INTERNAL_ERROR` (500) sin filtrar la causa.
 *
 * Se inyecta un cliente admin FALSO que enruta `appointments` (lectura por `maybeSingle`
 * y escritura por `update…select…single`) y `customers` (`maybeSingle`), capturando
 * columnas/filtros/valores por operación para auditarlos.
 */
import { describe, it, expect } from "vitest";

import {
  cancelAppointment,
  RECEPTION_CANCELLED_REASON,
  type CancelAppointmentDeps,
} from "@/lib/reception/cancel";
import { ReceptionError } from "@/lib/reception/errors";

// -----------------------------------------------------------------------------
// Cliente admin FALSO — appointments (read + update) y customers (read).
// -----------------------------------------------------------------------------

type Admin = NonNullable<CancelAppointmentDeps["admin"]>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

/** Una lectura capturada: columnas proyectadas y filtros aplicados. */
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
}

/** Una escritura capturada: valores del `update`, columnas del reread y filtros. */
interface UpdateCall {
  values: Record<string, unknown>;
  columns: string;
  filters: Record<string, unknown>;
}

interface FakeConfig {
  /** Resultado de la lectura de la cita por `(salon_id, id)` en `appointments`. */
  appointment?: QueryResult;
  /** Resultado de la búsqueda de ficha por `(salon_id, phone_e164)` en `customers`. */
  customer?: QueryResult;
  /** Resultado de la escritura (`update…select…single`) de la cancelación. */
  update?: QueryResult;
}

/**
 * Cliente admin falso. `from("appointments")` sirve DOS cadenas: la lectura
 * `.select().eq().eq().maybeSingle()` y la escritura `.update().eq().eq().select().single()`;
 * `from("customers")` sirve `.select().eq().eq().maybeSingle()`. Cada terminal registra su
 * llamada para auditar columnas, filtros y (en la escritura) los valores sellados.
 */
function fakeAdmin(config: FakeConfig): {
  admin: Admin;
  appointmentReads: SelectCall[];
  customerCalls: SelectCall[];
  updateCalls: UpdateCall[];
} {
  const appointmentReads: SelectCall[] = [];
  const customerCalls: SelectCall[] = [];
  const updateCalls: UpdateCall[] = [];

  const client = {
    from(table: string) {
      if (table === "appointments") {
        let columns = "";
        let updateValues: Record<string, unknown> | null = null;
        const filters: Record<string, unknown> = {};
        const builder = {
          select(cols: string) {
            columns = cols;
            return builder;
          },
          update(values: Record<string, unknown>) {
            updateValues = values;
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
          single() {
            updateCalls.push({
              values: updateValues ?? {},
              columns,
              filters: { ...filters },
            });
            return Promise.resolve(config.update ?? { data: null, error: null });
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

  return {
    admin: client as unknown as Admin,
    appointmentReads,
    customerCalls,
    updateCalls,
  };
}

/** Captura el `ReceptionError` que lanza `cancelAppointment` (o `null` si no lanzó). */
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
const STARTS_AT = "2026-07-24T09:00:00.000Z";

/** La cita existe en el salón y es de `cust-1`. */
const APPOINTMENT_ROW: QueryResult = {
  data: { id: APPT_ID, customer_id: CUSTOMER_ID },
  error: null,
};

/** La ficha del teléfono ES la dueña de la cita. */
const CUSTOMER_MATCH: QueryResult = { data: { id: CUSTOMER_ID }, error: null };

/** La ficha del teléfono es OTRO cliente (no el de la cita). */
const CUSTOMER_OTHER: QueryResult = { data: { id: "cust-OTRO" }, error: null };

/** Fila releída tras cancelar (con embeds to-one ya resueltos). */
const CANCELLED_ROW: QueryResult = {
  data: {
    id: APPT_ID,
    starts_at: STARTS_AT,
    status: "cancelled",
    cancelled_reason: RECEPTION_CANCELLED_REASON,
    service: { name: "Corte" },
    professional: { full_name: "Marta" },
  },
  error: null,
};

// -----------------------------------------------------------------------------
// Camino feliz — cancela la cita del dueño
// -----------------------------------------------------------------------------

describe("cancelAppointment — cancela (camino feliz)", () => {
  it("sella status+reason acotando por (salon_id,id) y devuelve la cita aplanada", async () => {
    const { admin, appointmentReads, customerCalls, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
      update: CANCELLED_ROW,
    });

    const result = await cancelAppointment(SALON, APPT_ID, "612 34 56 78", { admin });

    // Devuelve la cita ya cancelada, aplanada.
    expect(result).toEqual({
      id: APPT_ID,
      status: "cancelled",
      starts_at: STARTS_AT,
      service_name: "Corte",
      professional_name: "Marta",
      cancelled_reason: RECEPTION_CANCELLED_REASON,
    });

    // Localizó la cita por (salon_id, id).
    expect(appointmentReads).toHaveLength(1);
    expect(appointmentReads[0]!.filters).toEqual({ salon_id: SALON, id: APPT_ID });

    // Verificó titularidad por la ficha del teléfono canónico.
    expect(customerCalls).toHaveLength(1);
    expect(customerCalls[0]!.filters).toEqual({
      salon_id: SALON,
      phone_e164: "+34612345678",
    });

    // Escribió UNA vez: status+reason, acotando por (salon_id, id).
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.values).toEqual({
      status: "cancelled",
      cancelled_reason: RECEPTION_CANCELLED_REASON,
    });
    expect(updateCalls[0]!.filters).toEqual({ salon_id: SALON, id: APPT_ID });
  });
});

// -----------------------------------------------------------------------------
// APPOINTMENT_NOT_FOUND (404) — existencia antes que titularidad
// -----------------------------------------------------------------------------

describe("cancelAppointment — 404 APPOINTMENT_NOT_FOUND", () => {
  it("cita inexistente en el salón ⇒ 404 y NO mira titularidad ni cancela", async () => {
    const { admin, customerCalls, updateCalls } = fakeAdmin({
      appointment: { data: null, error: null },
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
    // Sin cita, no hay a quién comprobarle la pertenencia ni nada que escribir.
    expect(customerCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// NOT_YOUR_APPOINTMENT (403) — la cita existe pero no es de ese teléfono
// -----------------------------------------------------------------------------

describe("cancelAppointment — 403 NOT_YOUR_APPOINTMENT", () => {
  it("teléfono sin número real ⇒ 403 sin consultar la ficha ni cancelar", async () => {
    const { admin, appointmentReads, customerCalls, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "sin teléfono", { admin }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    // Localizó la cita, pero un teléfono no canonicalizable no identifica a nadie.
    expect(appointmentReads).toHaveLength(1);
    expect(customerCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("ningún cliente con ese teléfono ⇒ 403 sin cancelar", async () => {
    const { admin, customerCalls, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: { data: null, error: null },
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(customerCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
  });

  it("la cita es de OTRO cliente ⇒ 403 sin cancelar", async () => {
    const { admin, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_OTHER,
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(updateCalls).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Aislamiento multi-tenant — el salon_id viaja en TODAS las operaciones
// -----------------------------------------------------------------------------

describe("cancelAppointment — aislamiento por salón (nunca toca otro salón)", () => {
  it("acota por el salon_id recibido en lectura de cita, ficha y escritura", async () => {
    const { admin, appointmentReads, customerCalls, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
      update: CANCELLED_ROW,
    });

    await cancelAppointment("salon-OTRO", APPT_ID, "612345678", { admin });

    expect(appointmentReads[0]!.filters.salon_id).toBe("salon-OTRO");
    expect(customerCalls[0]!.filters.salon_id).toBe("salon-OTRO");
    expect(updateCalls[0]!.filters.salon_id).toBe("salon-OTRO");
  });
});

// -----------------------------------------------------------------------------
// normalizePhone — la ficha se busca por la forma canónica E.164
// -----------------------------------------------------------------------------

describe("cancelAppointment — reutiliza normalizePhone (busca por E.164 canónico)", () => {
  it.each([
    ["612345678", "+34612345678"],
    ["+34 612 34 56 78", "+34612345678"],
    ["0034612345678", "+34612345678"],
    ["(612) 345-678", "+34612345678"],
  ])("normaliza %s → %s antes de comprobar titularidad", async (input, canonical) => {
    const { admin, customerCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
      update: CANCELLED_ROW,
    });

    await cancelAppointment(SALON, APPT_ID, input, { admin });

    expect(customerCalls[0]!.filters.phone_e164).toBe(canonical);
  });
});

// -----------------------------------------------------------------------------
// Embeds robustos — servicio/profesional ausente ⇒ null
// -----------------------------------------------------------------------------

describe("cancelAppointment — embeds to-one robustos en la cita devuelta", () => {
  it("servicio null y profesional en forma de array ⇒ name o null", async () => {
    const { admin } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
      update: {
        data: {
          id: APPT_ID,
          starts_at: STARTS_AT,
          status: "cancelled",
          cancelled_reason: RECEPTION_CANCELLED_REASON,
          service: null,
          professional: [{ full_name: "Sara" }],
        },
        error: null,
      },
    });

    const result = await cancelAppointment(SALON, APPT_ID, "612345678", { admin });

    expect(result.service_name).toBeNull();
    expect(result.professional_name).toBe("Sara");
  });
});

// -----------------------------------------------------------------------------
// Errores — fallo REAL de consulta ⇒ INTERNAL_ERROR 500 sin filtrar la causa
// -----------------------------------------------------------------------------

describe("cancelAppointment — 500 INTERNAL_ERROR (sin fuga de la causa interna)", () => {
  it("error al leer la cita ⇒ 500 sin titularidad ni escritura", async () => {
    const { admin, customerCalls, updateCalls } = fakeAdmin({
      appointment: { data: null, error: { code: "42P01", message: "postgres: relation appointments" } },
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.message).not.toContain("42P01");
    expect(customerCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("error al leer la ficha ⇒ 500 sin escritura", async () => {
    const { admin, updateCalls } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: { data: null, error: { code: "42P01", message: "postgres: relation customers" } },
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.message).not.toContain("42P01");
    expect(updateCalls).toHaveLength(0);
  });

  it("error al escribir la cancelación ⇒ 500 sin filtrar el detalle", async () => {
    const { admin } = fakeAdmin({
      appointment: APPOINTMENT_ROW,
      customer: CUSTOMER_MATCH,
      update: { data: null, error: { code: "23514", message: "postgres: check constraint" } },
    });

    const error = await catchReceptionError(
      cancelAppointment(SALON, APPT_ID, "612345678", { admin }),
    );

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error?.message).not.toContain("23514");
  });
});
