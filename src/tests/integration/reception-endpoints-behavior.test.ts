/**
 * COMPORTAMIENTO de los endpoints de recepción — vista END-TO-END (sub-12).
 *
 * Los tests unitarios de cada capa (`reception-identify`, `reception-appointments`,
 * `reception-cancel`, `reception-reschedule`) ya afirman la forma de cada consulta con un
 * admin INYECTADO (columnas, filtros, nº de llamadas). Esta suite es COMPLEMENTARIA y de
 * otra naturaleza: prueba el COMPORTAMIENTO observable de los endpoints contra un ÚNICO
 * almacén EN MEMORIA CON ESTADO (una mini-Supabase) compartido por TODO el flujo, de modo
 * que las escrituras de un endpoint son visibles para las lecturas del siguiente. Así se
 * ejercita la LÓGICA REAL de recepción Y el MOTOR REAL de reservas (`createBookingForSalon`,
 * `rescheduleBookingForSalon`, con su recomputo de disponibilidad y su dedup por teléfono),
 * no dobles que devuelven un resultado prefijado.
 *
 * Los cinco comportamientos de la subtarea, verificados como HECHOS observables:
 *   1. identify — teléfono CONOCIDO ⇒ `found:true` con sus próximas citas (solo la agenda
 *      viva y futura, ordenada); DESCONOCIDO / sin número real ⇒ `found:false`.
 *   2. create — reutiliza la ficha por TELÉFONO: reservar dos veces con el MISMO número en
 *      OTRO formato NO duplica la ficha (una sola fila, ambas citas apuntan a ella).
 *   3. cancel / reschedule — SOLO sobre citas del cliente de ese teléfono: la cita AJENA ⇒
 *      `NOT_YOUR_APPOINTMENT` (403), sin tocar el estado.
 *   4. reschedule a un hueco OCUPADO ⇒ `SLOT_TAKEN` (409): el motor recomputa la
 *      disponibilidad y el hueco tomado por otra cita real ya no está.
 *   5. AISLAMIENTO multi-tenant en TODOS: la clave de un salón jamás ve/toca los datos de
 *      otro (ni ficha, ni cita, ni disponibilidad).
 *
 * ── Alcance (qué se ejercita y qué NO) ─────────────────────────────────────────────
 * El GUARD de authn/entitlement (`x-api-key` → salón, add-on `ai_receptionist`) es
 * transversal y ya está cubierto END-TO-END por `reception-auth-gate.test.ts` (sub-11).
 * Aquí se entra por la LÓGICA de cada endpoint —las funciones de dominio y el handler
 * exportado `handleReceptionCreateAppointment`— pasándole el `salonId` ya resuelto (el que
 * el guard entregaría), que es EXACTAMENTE el patrón de los unitarios de recepción. El
 * `salonId` es la única cota de tenant con el cliente admin (omite RLS), así que probar el
 * aislamiento sobre esa cota es probar la barrera real.
 *
 * ── El doble con estado ────────────────────────────────────────────────────────────
 * Se mockea `@/lib/supabase/admin` para que TODAS las capas (recepción y motor) hablen con
 * el MISMO almacén en memoria: aplica filtros `.eq/.neq/.in/.gte`, persiste `insert/update`,
 * calcula `phone_e164` al insertar clientes (espejo de la columna generada, vía el
 * `normalizePhone` REAL) y sintetiza los bloques de ocupación al crear/mover citas (espejo
 * pragmático del trigger `sync_appointment_blocks` para servicios de una sola fase), de modo
 * que la disponibilidad recomputada refleja de verdad qué huecos están tomados. Nada de red,
 * credenciales ni datos de producción: los salones son sintéticos (`salon-a`/`salon-b`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest, NextResponse } from "next/server";

import { normalizePhone } from "@/lib/customers/normalize-phone";

// -----------------------------------------------------------------------------
// Almacén EN MEMORIA CON ESTADO — una mini-Supabase compartida por todo el flujo.
// -----------------------------------------------------------------------------
type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  tables: new Map<string, Row[]>(),
  seq: 0,
}));

function rowsOf(table: string): Row[] {
  if (!holder.tables.has(table)) holder.tables.set(table, []);
  return holder.tables.get(table) as Row[];
}

/** Literal `tstzrange` que `parseTstzRange` (motor) sabe leer: `["<ISO>","<ISO>")`. */
function rangeLiteral(startsAt: string, endsAt: string): string {
  return `["${startsAt}","${endsAt}")`;
}

/**
 * Resuelve los embeds to-one que la recepción pide sobre `appointments`
 * (`service:services(name)` y `professional:professionals(full_name)`): los adjunta desde
 * las tablas semilla según `service_id`/`professional_id`. Devolver campos DE MÁS es inocuo
 * (cada capa proyecta lo suyo), así que solo se añaden cuando la `select` los solicita.
 */
function projectAppointment(row: Row, columns: string): Row {
  const out: Row = { ...row };
  if (columns.includes("service:services(name)")) {
    const service = rowsOf("services").find((s) => s.id === row.service_id);
    out.service = service ? { name: service.name } : null;
  }
  if (columns.includes("professional:professionals(full_name)")) {
    const professional = rowsOf("professionals").find((p) => p.id === row.professional_id);
    out.professional = professional ? { full_name: professional.full_name } : null;
  }
  return out;
}

/** Regenera los bloques de ocupación de una cita (borra los suyos y crea el actual). */
function syncBlocksFor(appointment: Row): void {
  const blocks = rowsOf("appointment_blocks");
  // Fuera los bloques previos de esta cita (al mover, su hueco viejo se libera).
  holder.tables.set(
    "appointment_blocks",
    blocks.filter((b) => b.appointment_id !== appointment.id),
  );
  // Cita cancelada ⇒ no ocupa (deja el hueco libre para otras).
  if (appointment.status === "cancelled") return;
  rowsOf("appointment_blocks").push({
    salon_id: appointment.salon_id,
    professional_id: appointment.professional_id,
    appointment_id: appointment.id,
    // Servicio de una sola fase (exposure/post = 0): el bloque físico == la cita entera.
    occupied_range: rangeLiteral(
      appointment.starts_at as string,
      appointment.ends_at as string,
    ),
  });
}

/**
 * Query builder fiel (parcial) sobre el almacén. Encadena `select/eq/neq/in/gte/order/
 * filter/insert/update` y resuelve en `maybeSingle/single` (una fila) o al await (lista,
 * vía `then`). `insert` de clientes calcula `phone_e164`; `insert/update` de citas
 * sincroniza los bloques de ocupación.
 */
function makeBuilder(table: string) {
  let columns = "";
  let order: { column: string; ascending: boolean } | null = null;
  let pendingInsert: Row | null = null;
  let pendingUpdate: Row | null = null;
  const predicates: Array<(r: Row) => boolean> = [];

  const applyFilters = (list: Row[]): Row[] => list.filter((r) => predicates.every((p) => p(r)));

  function runInsert(): Row {
    const id = table === "customers" ? `cust-${++holder.seq}` : `apt-${++holder.seq}`;
    const row: Row = { ...(pendingInsert as Row), id };
    if (table === "customers") {
      row.phone_e164 = normalizePhone(row.phone as string | null);
    }
    rowsOf(table).push(row);
    if (table === "appointments") syncBlocksFor(row);
    return row;
  }

  function runUpdate(): Row[] {
    const targets = applyFilters(rowsOf(table));
    for (const r of targets) {
      Object.assign(r, pendingUpdate as Row);
      if (table === "appointments") syncBlocksFor(r);
    }
    return targets;
  }

  function resolveList(): { data: Row[]; error: null } {
    let data: Row[];
    if (pendingInsert !== null) data = [runInsert()];
    else if (pendingUpdate !== null) data = runUpdate();
    else data = applyFilters(rowsOf(table));

    if (order) {
      const { column, ascending } = order;
      data = [...data].sort((a, b) => {
        const av = a[column] as string;
        const bv = b[column] as string;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return ascending ? cmp : -cmp;
      });
    }
    if (table === "appointments" && columns) {
      data = data.map((r) => projectAppointment(r, columns));
    }
    return { data, error: null };
  }

  const resolveOne = (): { data: Row | null; error: null } => ({
    data: resolveList().data[0] ?? null,
    error: null,
  });

  const b = {
    select(cols: string) {
      columns = cols;
      return b;
    },
    eq(col: string, val: unknown) {
      predicates.push((r) => r[col] === val);
      return b;
    },
    neq(col: string, val: unknown) {
      predicates.push((r) => r[col] !== val);
      return b;
    },
    in(col: string, vals: unknown[]) {
      predicates.push((r) => vals.includes(r[col]));
      return b;
    },
    gte(col: string, val: unknown) {
      predicates.push((r) => (r[col] as string) >= (val as string));
      return b;
    },
    // Solo `appointment_blocks` lo usa (solape con el día): no-op, el motor hace el
    // solape real contra `busy` en `generateSlots` a partir de los bloques devueltos.
    filter() {
      return b;
    },
    order(column: string, opts: { ascending: boolean }) {
      order = { column, ascending: opts.ascending };
      return b;
    },
    limit() {
      return b;
    },
    insert(payload: Row) {
      pendingInsert = payload;
      return b;
    },
    update(payload: Row) {
      pendingUpdate = payload;
      return b;
    },
    maybeSingle: () => Promise.resolve(resolveOne()),
    single: () => Promise.resolve(resolveOne()),
    then: (onFulfilled: (v: { data: Row[]; error: null }) => unknown) =>
      onFulfilled(resolveList()),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

// Bajo el mock: las funciones de dominio de recepción (sin `deps`) y el motor de reservas
// resuelven `createAdminClient()` al almacén con estado. Se importan DESPUÉS del mock.
import { handleReceptionCreateAppointment } from "@/app/api/reception/appointments/handler";
import { identifyCustomer } from "@/lib/reception/identify";
import { cancelAppointment, RECEPTION_CANCELLED_REASON } from "@/lib/reception/cancel";
import { rescheduleAppointment } from "@/lib/reception/reschedule";
import { ReceptionError } from "@/lib/reception/errors";

// -----------------------------------------------------------------------------
// Mundo sintético — DOS salones (aislamiento), lunes 09:00–17:00, servicio de una
// fase de 30 min. El reloj se fija a medianoche de ese lunes: los huecos diurnos son
// futuros y no los descarta la antelación mínima.
// -----------------------------------------------------------------------------
const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // lunes (weekday 1)

const SALON_A = "salon-a";
const SALON_B = "salon-b";

// serviceId/professionalId deben ser uuid (el schema Zod del create los valida).
const SERVICE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PRO_A = "aaaaaaaa-0000-4000-8000-000000000002";
const SERVICE_B = "bbbbbbbb-0000-4000-8000-000000000001";
const PRO_B = "bbbbbbbb-0000-4000-8000-000000000002";

// Huecos válidos (11:00/11:30/12:00 Madrid = 09:00/09:30/10:00 UTC en CEST, +2).
const SLOT_1 = "2025-06-09T09:00:00.000Z";
const SLOT_2 = "2025-06-09T09:30:00.000Z";
const SLOT_3 = "2025-06-09T10:00:00.000Z";

/** Siembra el catálogo de un salón (salón activo + servicio + profesional + horario). */
function seedSalon(salonId: string, serviceId: string, professionalId: string): void {
  rowsOf("salons").push({
    id: salonId,
    name: `Salón ${salonId}`,
    slug: salonId,
    timezone: TZ,
    active: true,
    phone: null,
    address: null,
    settings: { slot_interval_minutes: 30, min_lead_minutes: 0 },
  });
  rowsOf("services").push({
    id: serviceId,
    salon_id: salonId,
    name: "Corte",
    application_min: 30,
    exposure_min: 0,
    post_exposure_min: 0,
    price_cents: 2000,
    currency: "EUR",
    active: true,
  });
  rowsOf("professionals").push({
    id: professionalId,
    salon_id: salonId,
    full_name: "Ana",
    active: true,
    color: null,
  });
  rowsOf("professional_services").push({
    salon_id: salonId,
    service_id: serviceId,
    professional_id: professionalId,
    professionals: { active: true },
  });
  rowsOf("professional_schedules").push({
    salon_id: salonId,
    professional_id: professionalId,
    weekday: 1,
    start_time: "09:00:00",
    end_time: "17:00:00",
  });
}

/** Alta directa de una ficha (para escenarios que parten de un cliente ya existente). */
function seedCustomer(
  salonId: string,
  attrs: { id: string; full_name: string; phone: string },
): void {
  rowsOf("customers").push({
    id: attrs.id,
    salon_id: salonId,
    full_name: attrs.full_name,
    phone: attrs.phone,
    phone_e164: normalizePhone(attrs.phone),
    email: null,
    user_id: null,
    marketing_consent: false,
  });
}

/** Alta directa de una cita (para poblar la agenda que `identify` debe leer). */
function seedAppointment(
  salonId: string,
  attrs: {
    id: string;
    customer_id: string;
    service_id: string;
    professional_id: string;
    status: string;
    starts_at: string;
  },
): void {
  const endsAt = new Date(new Date(attrs.starts_at).getTime() + 30 * 60_000).toISOString();
  rowsOf("appointments").push({
    id: attrs.id,
    salon_id: salonId,
    customer_id: attrs.customer_id,
    professional_id: attrs.professional_id,
    service_id: attrs.service_id,
    status: attrs.status,
    starts_at: attrs.starts_at,
    ends_at: endsAt,
    price_cents: 2000,
    currency: "EUR",
    notes: null,
    cancelled_reason: null,
  });
}

// -----------------------------------------------------------------------------
// Utilidades de invocación de los endpoints (por su LÓGICA, con el salonId ya resuelto).
// -----------------------------------------------------------------------------
interface CreateBody {
  serviceId: string;
  professionalId: string;
  startsAt: string;
  customer: { full_name: string; phone: string; email?: string };
}

/** Petición cuyo `json()` resuelve al cuerpo (lo único que lee el handler de create). */
function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** Crea una cita por recepción; devuelve la respuesta y el cuerpo ya parseado. */
async function createAppointment(
  salonId: string,
  body: CreateBody,
): Promise<{ res: NextResponse; json: Record<string, unknown> }> {
  const res = await handleReceptionCreateAppointment(req(body), salonId);
  const json = (await res.json()) as Record<string, unknown>;
  return { res, json };
}

/** Cuerpo válido de create con valores por defecto del salón A. */
function createBody(overrides: Partial<CreateBody> = {}): CreateBody {
  return {
    serviceId: SERVICE_A,
    professionalId: PRO_A,
    startsAt: SLOT_1,
    customer: { full_name: "Cliente Prueba", phone: "+34600000000" },
    ...overrides,
  };
}

/** Captura el `ReceptionError` que lanza una operación (o `null` si no lanzó). */
async function catchReceptionError(promise: Promise<unknown>): Promise<ReceptionError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ReceptionError) return error;
    throw error;
  }
}

/** Lecturas de conveniencia sobre el almacén. */
const apptById = (id: string): Row | undefined => rowsOf("appointments").find((a) => a.id === id);
const customersFor = (salonId: string, e164: string | null): Row[] =>
  rowsOf("customers").filter((c) => c.salon_id === salonId && c.phone_e164 === e164);

beforeEach(() => {
  holder.tables = new Map<string, Row[]>();
  holder.seq = 0;
  seedSalon(SALON_A, SERVICE_A, PRO_A);
  seedSalon(SALON_B, SERVICE_B, PRO_B);
  // Reloj: medianoche del lunes de prueba (todos los huecos diurnos quedan en el futuro).
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DATE}T00:00:00.000Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1) identify — reconoce por teléfono; aísla por salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("identify — teléfono conocido ⇒ found:true con próximas citas; desconocido ⇒ found:false", () => {
  const ANA = "+34611111111";

  beforeEach(() => {
    // Ana existe en A con: 2 citas vivas y futuras, 1 pasada y 1 cancelada (a excluir).
    seedCustomer(SALON_A, { id: "ana", full_name: "Ana Ruiz", phone: ANA });
    seedAppointment(SALON_A, {
      id: "ana-apt-2",
      customer_id: "ana",
      service_id: SERVICE_A,
      professional_id: PRO_A,
      status: "pending",
      starts_at: SLOT_3, // más tarde
    });
    seedAppointment(SALON_A, {
      id: "ana-apt-1",
      customer_id: "ana",
      service_id: SERVICE_A,
      professional_id: PRO_A,
      status: "confirmed",
      starts_at: SLOT_1, // más pronto (debe salir primero)
    });
    seedAppointment(SALON_A, {
      id: "ana-past",
      customer_id: "ana",
      service_id: SERVICE_A,
      professional_id: PRO_A,
      status: "confirmed",
      starts_at: "2025-06-08T09:00:00.000Z", // ayer: fuera
    });
    seedAppointment(SALON_A, {
      id: "ana-cancelled",
      customer_id: "ana",
      service_id: SERVICE_A,
      professional_id: PRO_A,
      status: "cancelled",
      starts_at: SLOT_2, // futura pero cancelada: fuera
    });
  });

  it("teléfono conocido (en otro formato) ⇒ found:true, ficha mínima y agenda viva ordenada", async () => {
    const result = await identifyCustomer(SALON_A, "611 11 11 11");

    expect(result.found).toBe(true);
    expect(result.customer).toEqual({ id: "ana", full_name: "Ana Ruiz" });
    // Solo las dos vivas y futuras, la más cercana primero; ni la pasada ni la cancelada.
    expect(result.upcoming?.map((u) => u.id)).toEqual(["ana-apt-1", "ana-apt-2"]);
    expect(result.upcoming?.every((u) => ["pending", "confirmed"].includes(u.status))).toBe(true);
    expect(result.upcoming?.[0]).toMatchObject({
      id: "ana-apt-1",
      starts_at: SLOT_1,
      service_name: "Corte",
      professional_name: "Ana",
    });
  });

  it("teléfono desconocido ⇒ found:false", async () => {
    const result = await identifyCustomer(SALON_A, "699 99 99 99");
    expect(result).toEqual({ found: false });
  });

  it("teléfono sin número real ⇒ found:false", async () => {
    const result = await identifyCustomer(SALON_A, "sin teléfono");
    expect(result).toEqual({ found: false });
  });

  it("aislamiento: el salón B NO reconoce a la clienta del salón A ⇒ found:false", async () => {
    const result = await identifyCustomer(SALON_B, "611 11 11 11");
    expect(result).toEqual({ found: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) create — reutiliza la ficha por teléfono (dedup); aísla por salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("create — reutiliza la ficha por teléfono (mismo número en otro formato no duplica)", () => {
  const DEDUP = "+34622222222";
  const DEDUP_E164 = normalizePhone(DEDUP);

  it("dos reservas con el MISMO teléfono en OTRO formato ⇒ una sola ficha, ambas citas a ella", async () => {
    const first = await createAppointment(
      SALON_A,
      createBody({ startsAt: SLOT_1, customer: { full_name: "Bea Sol", phone: DEDUP } }),
    );
    const second = await createAppointment(
      SALON_A,
      // Mismo número, formato distinto (espacios) y a otra hora libre: no debe duplicar.
      createBody({ startsAt: SLOT_2, customer: { full_name: "Bea Sol", phone: "622 22 22 22" } }),
    );

    expect(first.res.status).toBe(201);
    expect(second.res.status).toBe(201);

    // UNA sola ficha en el salón A para ese teléfono canónico.
    const fichas = customersFor(SALON_A, DEDUP_E164);
    expect(fichas).toHaveLength(1);

    // Ambas citas apuntan a esa MISMA ficha (dedup por teléfono, no una ficha nueva).
    const firstAppt = apptById(first.json.id as string);
    const secondAppt = apptById(second.json.id as string);
    expect(firstAppt?.customer_id).toBe(fichas[0]!.id);
    expect(secondAppt?.customer_id).toBe(fichas[0]!.id);
  });

  it("teléfono nuevo ⇒ crea una ficha nueva", async () => {
    const nuevo = "+34644444444";
    expect(customersFor(SALON_A, normalizePhone(nuevo))).toHaveLength(0);

    await createAppointment(
      SALON_A,
      createBody({ customer: { full_name: "Nuevo Cliente", phone: nuevo } }),
    );

    expect(customersFor(SALON_A, normalizePhone(nuevo))).toHaveLength(1);
  });

  it("aislamiento: un teléfono ya usado en el salón B NO se reutiliza en el salón A", async () => {
    const shared = "+34655555555";
    const sharedE164 = normalizePhone(shared);
    seedCustomer(SALON_B, { id: "vecina", full_name: "Vecina", phone: shared });

    await createAppointment(
      SALON_A,
      createBody({ customer: { full_name: "Homónima", phone: shared } }),
    );

    // El salón A crea su PROPIA ficha (distinta de la del vecino)…
    const fichasA = customersFor(SALON_A, sharedE164);
    expect(fichasA).toHaveLength(1);
    expect(fichasA[0]!.id).not.toBe("vecina");
    // …y la ficha del salón B queda intacta (sigue siendo una sola).
    expect(customersFor(SALON_B, sharedE164)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) cancel — solo el dueño; aísla por salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("cancel — solo sobre la cita del cliente de ese teléfono (cita ajena ⇒ NOT_YOUR_APPOINTMENT)", () => {
  const ANA = "+34611111111";
  const BEA = "+34633333333";
  let anaAppt: string;

  beforeEach(async () => {
    // Ana reserva (el motor crea su ficha por teléfono); Bea es otra clienta real.
    const created = await createAppointment(
      SALON_A,
      createBody({ startsAt: SLOT_1, customer: { full_name: "Ana Ruiz", phone: ANA } }),
    );
    anaAppt = created.json.id as string;
    await createAppointment(
      SALON_A,
      createBody({ startsAt: SLOT_3, customer: { full_name: "Bea Sol", phone: BEA } }),
    );
  });

  it("otra clienta (Bea) NO puede cancelar la cita de Ana ⇒ 403 y la cita sigue viva", async () => {
    const error = await catchReceptionError(cancelAppointment(SALON_A, anaAppt, BEA));

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(apptById(anaAppt)?.status).toBe("pending"); // intacta
  });

  it("la dueña (Ana, en otro formato) SÍ cancela; deja de figurar en sus próximas citas", async () => {
    const cancelled = await cancelAppointment(SALON_A, anaAppt, "611 11 11 11");

    expect(cancelled).toMatchObject({
      id: anaAppt,
      status: "cancelled",
      cancelled_reason: RECEPTION_CANCELLED_REASON,
    });
    expect(apptById(anaAppt)?.status).toBe("cancelled");

    // Comportamiento de punta a punta: al re-identificar, la cita cancelada ya no sale.
    const after = await identifyCustomer(SALON_A, ANA);
    expect(after.upcoming?.some((u) => u.id === anaAppt)).toBe(false);
  });

  it("aislamiento: el salón B NO ve la cita del salón A ⇒ APPOINTMENT_NOT_FOUND (404)", async () => {
    const error = await catchReceptionError(cancelAppointment(SALON_B, anaAppt, ANA));

    expect(error).toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
    expect(apptById(anaAppt)?.status).toBe("pending"); // intacta en A
  });

  it("cita inexistente ⇒ APPOINTMENT_NOT_FOUND (404)", async () => {
    const error = await catchReceptionError(cancelAppointment(SALON_A, "apt-inexistente", ANA));
    expect(error).toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) reschedule — solo el dueño; hueco ocupado ⇒ SLOT_TAKEN; aísla por salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("reschedule — dueño, hueco ocupado (SLOT_TAKEN) y aislamiento por salón", () => {
  const ANA = "+34611111111";
  const BEA = "+34633333333";
  let anaAppt: string;

  beforeEach(async () => {
    // Ana en SLOT_1; Bea ocupa SLOT_3 con el MISMO (único) profesional del salón A.
    const created = await createAppointment(
      SALON_A,
      createBody({ startsAt: SLOT_1, customer: { full_name: "Ana Ruiz", phone: ANA } }),
    );
    anaAppt = created.json.id as string;
    await createAppointment(
      SALON_A,
      createBody({ startsAt: SLOT_3, customer: { full_name: "Bea Sol", phone: BEA } }),
    );
  });

  it("otra clienta (Bea) NO puede mover la cita de Ana ⇒ 403 y la cita no se mueve", async () => {
    const error = await catchReceptionError(
      rescheduleAppointment(SALON_A, anaAppt, BEA, SLOT_2, undefined),
    );

    expect(error).toMatchObject({ code: "NOT_YOUR_APPOINTMENT", status: 403 });
    expect(apptById(anaAppt)?.starts_at).toBe(SLOT_1); // sin mover
  });

  it("mover a un hueco OCUPADO (el de Bea) ⇒ SLOT_TAKEN (409) y la cita no se mueve", async () => {
    const error = await catchReceptionError(
      // Ana intenta ir a SLOT_3, tomado por Bea con el mismo profesional.
      rescheduleAppointment(SALON_A, anaAppt, ANA, SLOT_3, undefined),
    );

    expect(error).toMatchObject({ code: "SLOT_TAKEN", status: 409 });
    expect(apptById(anaAppt)?.starts_at).toBe(SLOT_1); // sigue en su hueco original
  });

  it("la dueña mueve a un hueco LIBRE ⇒ la cita se reprograma y se ve al re-identificar", async () => {
    const moved = await rescheduleAppointment(SALON_A, anaAppt, "611 11 11 11", SLOT_2, undefined);

    expect(moved).toMatchObject({ id: anaAppt, starts_at: SLOT_2 });
    expect(apptById(anaAppt)?.starts_at).toBe(SLOT_2);

    const after = await identifyCustomer(SALON_A, ANA);
    expect(after.upcoming?.find((u) => u.id === anaAppt)?.starts_at).toBe(SLOT_2);
  });

  it("aislamiento: el salón B NO puede mover la cita del salón A ⇒ 404", async () => {
    const error = await catchReceptionError(
      rescheduleAppointment(SALON_B, anaAppt, ANA, SLOT_2, undefined),
    );

    expect(error).toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
    expect(apptById(anaAppt)?.starts_at).toBe(SLOT_1); // intacta en A
  });
});
