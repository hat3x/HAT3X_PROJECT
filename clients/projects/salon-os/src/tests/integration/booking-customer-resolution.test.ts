/**
 * RESOLUCIÓN DE CLIENTE en la reserva pública — identidad por TELÉFONO, extremo a
 * extremo sobre un doble FIEL de la base de datos.
 *
 * Ejercita `createBooking` (`@/lib/booking/server`) con un doble de Supabase que
 * MODELA DE VERDAD el invariante de la BD (a diferencia de
 * `booking-customer-phone.test.ts`, cuyo mock es laxo y no filtra):
 *   · calcula `phone_e164 = normalizePhone(phone)` en cada INSERT de `customers`,
 *     igual que la columna GENERADA de la migración 20260717110000, y
 *   · aplica el índice ÚNICO PARCIAL `(salon_id, phone_e164) where phone_e164 not
 *     null` rechazando la colisión dentro de un salón con el código `23505`, y
 *   · FILTRA de verdad los `eq(...)` (por `salon_id`, `phone_e164`, `id`…), de modo
 *     que "buscar la ficha por teléfono acotado al salón" se comporta como en la BD.
 *
 * Gracias a ese realismo, aquí se DEMUESTRA lo que un mock laxo no puede:
 *   (a) EL BUG QUE SE ARREGLÓ — un cliente recurrente que teclea su teléfono en OTRO
 *       formato (612 34 56 78 vs +34612345678 vs 0034…) reutiliza su MISMA ficha y la
 *       reserva SALE ADELANTE; antes no encontraba la ficha, chocaba con el único y
 *       fallaba. Se comprueba que no se duplica y que NO se pisa su cuenta/nombre.
 *   (b) un teléfono NUEVO crea ficha (y `phone_e164` se deriva a la forma canónica).
 *   (c) una CARRERA que esquiva el pre-chequeo (23505) se re-resuelve por teléfono y
 *       reutiliza la ficha ganadora, sin romper ni duplicar.
 *   (d) NO se cruzan salones: el mismo teléfono en el salón B no contamina la reserva
 *       del salón A (Salón OS es multi-tenant; el único es por salón).
 *
 * No hay Postgres: la lógica de negocio real corre contra la BD en memoria.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { normalizePhone } from "@/lib/customers/normalize-phone";

type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  store: new Map<string, Row[]>(),
  idCounter: 0,
  /**
   * Claves `${salon_id}::${phone_e164}` que el PRÓXIMO read por teléfono debe fingir
   * NO ver (una sola vez). Simula la ventana de carrera: el pre-chequeo no encuentra
   * la ficha que otra petición insertó microsegundos antes, el código intenta INSERT
   * y choca con el índice único (`23505`).
   */
  hidePhoneOnce: new Set<string>(),
}));

interface Pending {
  op: "insert";
  payload: Row;
}

/**
 * Query builder de Supabase sobre la BD en memoria. Filtra los `eq(...)` de verdad,
 * deriva `phone_e164` en el INSERT de `customers` (columna generada) y aplica el
 * índice único parcial `(salon_id, phone_e164)`.
 */
function makeBuilder(table: string) {
  const rows = (): Row[] => {
    if (!holder.store.has(table)) holder.store.set(table, []);
    return holder.store.get(table) as Row[];
  };

  const filters: Array<(row: Row) => boolean> = [];
  const eqMap: Record<string, unknown> = {};
  let pending: Pending | null = null;

  const apply = (list: Row[]): Row[] => list.filter((r) => filters.every((f) => f(r)));

  /** phone_e164 derivado como la columna GENERADA (si no viene ya calculado). */
  function withGeneratedColumns(p: Row): Row {
    const row: Row = { id: p.id ?? `${table}-${++holder.idCounter}`, ...p };
    if (table === "customers" && !("phone_e164" in row)) {
      row.phone_e164 = normalizePhone((row.phone as string | null | undefined) ?? null);
    }
    return row;
  }

  /** ¿La fila viola el único parcial `(salon_id, phone_e164)` ya presente? */
  function uniqueViolation(candidate: Row): boolean {
    if (table !== "customers" || candidate.phone_e164 == null) return false;
    return rows().some(
      (r) =>
        r !== candidate &&
        r.salon_id === candidate.salon_id &&
        r.phone_e164 === candidate.phone_e164,
    );
  }

  function runWrite(): { data: Row[]; error: { code: string } | null } {
    const row = withGeneratedColumns((pending as Pending).payload);
    if (uniqueViolation(row)) {
      // El índice único parcial rechaza el duplicado: nada se persiste.
      return { data: [], error: { code: "23505" } };
    }
    rows().push(row);
    return { data: [row], error: null };
  }

  function runRead(): { data: Row[]; error: null } {
    // Ventana de carrera: ocultar UNA vez el read por (salon_id, phone_e164) marcado.
    // Se exige que la consulta acote AMBOS —como el pre-chequeo real
    // findCustomerIdByPhoneE164—, para no suprimir por accidente el lookup de OTRO
    // salón con el mismo teléfono.
    if (
      table === "customers" &&
      typeof eqMap.phone_e164 === "string" &&
      typeof eqMap.salon_id === "string"
    ) {
      const raceKey = `${String(eqMap.salon_id)}::${String(eqMap.phone_e164)}`;
      if (holder.hidePhoneOnce.has(raceKey)) {
        holder.hidePhoneOnce.delete(raceKey);
        return { data: [], error: null };
      }
    }
    return { data: apply(rows()), error: null };
  }

  const resolveList = (): { data: Row[]; error: { code: string } | null } =>
    pending !== null ? runWrite() : runRead();

  const resolveSingle = (): { data: Row | null; error: { code: string } | null } => {
    const { data, error } = resolveList();
    return { data: data[0] ?? null, error };
  };

  const b = {
    select: (_cols?: string) => b,
    eq: (col: string, val: unknown) => {
      eqMap[col] = val;
      filters.push((r) => r[col] === val);
      return b;
    },
    // `filter`/`order`/`limit` no cambian el conjunto en estos escenarios (bloques
    // vacíos, un único registro por consulta): passthrough para completar el contrato.
    filter: () => b,
    order: () => b,
    limit: () => b,
    insert: (payload: Row) => {
      pending = { op: "insert", payload };
      return b;
    },
    maybeSingle: () => Promise.resolve(resolveSingle()),
    single: () => Promise.resolve(resolveSingle()),
    then: (onFulfilled: (v: { data: Row[]; error: { code: string } | null }) => unknown) =>
      onFulfilled(resolveList()),
  };
  return b;
}

function makeClient() {
  return { from: (table: string) => makeBuilder(table) };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

import { createBooking, BookingError } from "@/lib/booking/server";
import type { CreateBookingInput } from "@/lib/booking/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario: lunes 2025-06-09, servicio de 30 min de una fase, horario 09:00–17:00.
// Hueco libre 11:00 Madrid = 09:00 UTC (CEST, +2). Dos salones (multi-tenant).
// ─────────────────────────────────────────────────────────────────────────────
const TZ = "Europe/Madrid";
const DATE = "2025-06-09"; // Lunes (weekday 1)
const AT_FREE = "2025-06-09T09:00:00.000Z";

interface SalonSeed {
  id: string;
  slug: string;
  name: string;
  serviceId: string;
  proId: string;
  proName: string;
}

const SALON_A: SalonSeed = {
  id: "salon-a",
  slug: "salon-alfa",
  name: "Salón Alfa",
  serviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  proId: "a1111111-1111-1111-1111-111111111111",
  proName: "Ana",
};
const SALON_B: SalonSeed = {
  id: "salon-b",
  slug: "salon-beta",
  name: "Salón Beta",
  serviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  proId: "b2222222-2222-2222-2222-222222222222",
  proName: "Berta",
};

function push(table: string, row: Row): void {
  if (!holder.store.has(table)) holder.store.set(table, []);
  (holder.store.get(table) as Row[]).push(row);
}

/** Siembra un salón completo (salón + servicio + profesional + horario) capaz de reservar. */
function seedSalon(s: SalonSeed): void {
  push("salons", {
    id: s.id,
    name: s.name,
    slug: s.slug,
    timezone: TZ,
    phone: null,
    address: null,
    active: true,
    settings: { slot_interval_minutes: 30, min_lead_minutes: 0 },
  });
  push("services", {
    id: s.serviceId,
    salon_id: s.id,
    name: "Corte",
    application_min: 30,
    exposure_min: 0,
    post_exposure_min: 0,
    price_cents: 2000,
    currency: "EUR",
    active: true,
  });
  push("professional_services", {
    salon_id: s.id,
    service_id: s.serviceId,
    professional_id: s.proId,
    professionals: { active: true },
  });
  push("professional_schedules", {
    salon_id: s.id,
    professional_id: s.proId,
    weekday: 1,
    start_time: "09:00:00",
    end_time: "17:00:00",
  });
  push("professionals", { id: s.proId, salon_id: s.id, full_name: s.proName, active: true });
}

/** Siembra una ficha existente con su `phone_e164` derivado (como la columna generada). */
function seedCustomer(row: Row): void {
  push("customers", {
    phone_e164: normalizePhone((row.phone as string | null | undefined) ?? null),
    ...row,
  });
}

const customers = (): Row[] => holder.store.get("customers") ?? [];
const appointments = (): Row[] => holder.store.get("appointments") ?? [];

/** Input de reserva en el hueco libre del salón indicado. Email opcional (identidad = teléfono). */
function bookingInput(
  salon: SalonSeed,
  phone: string,
  opts: { fullName?: string; email?: string } = {},
): CreateBookingInput {
  return {
    serviceId: salon.serviceId,
    professionalId: "any",
    startsAt: AT_FREE,
    customer: {
      fullName: opts.fullName ?? "Cliente Prueba",
      email: opts.email,
      phone,
      marketingConsent: false,
    },
  };
}

// Reloj fijo a medianoche del día de prueba: los huecos diurnos quedan en el futuro.
beforeEach(() => {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.hidePhoneOnce = new Set<string>();
  seedSalon(SALON_A);
  seedSalon(SALON_B);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DATE}T00:00:00.000Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// (a) EL BUG: cliente recurrente con el teléfono en OTRO formato → reutiliza ficha.
// ─────────────────────────────────────────────────────────────────────────────
describe("(a) cliente recurrente reserva con el teléfono en otro formato → reutiliza su ficha (el bug arreglado)", () => {
  // Todos estos pares son EL MISMO número (+34612345678) en formatos distintos:
  // la ficha se guardó con uno y el cliente reserva tecleando el otro.
  it.each([
    ["+34 612 345 678", "612 34 56 78"],
    ["612345678", "0034612345678"],
    ["(612) 345-678", "+34612345678"],
    ["+34612345678", "612-345-678"],
  ])(
    "ficha con %j, reserva con %j → misma ficha, sin fallo ni duplicado",
    async (storedPhone, bookingPhone) => {
      // Ficha ya existente del cliente recurrente, con su cuenta y nombre.
      seedCustomer({
        id: "cust-recurrente",
        salon_id: SALON_A.id,
        user_id: "user-recurrente",
        full_name: "Nombre Previo",
        phone: storedPhone,
        email: "previo@example.com",
      });

      // Reserva tecleando el teléfono en OTRO formato (sin email: identidad = teléfono).
      const confirmation = await createBooking(SALON_A.slug, bookingInput(SALON_A, bookingPhone));

      // La reserva SALE ADELANTE (antes fallaba)…
      expect(confirmation.appointmentId).toEqual(expect.any(String));
      // …apuntando a la MISMA ficha (dedup por teléfono canónico)…
      expect(appointments()).toHaveLength(1);
      expect(appointments()[0]?.customer_id).toBe("cust-recurrente");
      // …sin crear una segunda ficha…
      expect(customers()).toHaveLength(1);
      // …y sin pisar su cuenta ni su nombre (se REUTILIZA tal cual).
      expect(customers()[0]?.user_id).toBe("user-recurrente");
      expect(customers()[0]?.full_name).toBe("Nombre Previo");
    },
  );

  it("el teléfono manda sobre el email: mismo número, email distinto → reutiliza por teléfono (no crea ni choca por email)", async () => {
    seedCustomer({
      id: "cust-por-telefono",
      salon_id: SALON_A.id,
      user_id: "user-x",
      full_name: "Titular",
      phone: "+34612345678",
      email: "titular@example.com",
    });

    // Mismo número en otro formato pero con OTRO email: la resolución por teléfono
    // (que va primero) reutiliza la ficha sin llegar a mirar el email.
    const confirmation = await createBooking(
      SALON_A.slug,
      bookingInput(SALON_A, "612 34 56 78", { email: "otro@example.com" }),
    );

    expect(confirmation.appointmentId).toEqual(expect.any(String));
    expect(appointments()[0]?.customer_id).toBe("cust-por-telefono");
    expect(customers()).toHaveLength(1);
    expect(customers()[0]?.email).toBe("titular@example.com"); // intacto
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) Teléfono nuevo → crea ficha (y deriva phone_e164 a la forma canónica).
// ─────────────────────────────────────────────────────────────────────────────
describe("(b) teléfono nuevo → crea ficha", () => {
  it("un teléfono que no existe en el salón crea la ficha y la cita apunta a ella", async () => {
    expect(customers()).toHaveLength(0);

    const confirmation = await createBooking(
      SALON_A.slug,
      bookingInput(SALON_A, "600 123 456", { fullName: "Nuevo Cliente" }),
    );

    expect(confirmation.appointmentId).toEqual(expect.any(String));
    expect(customers()).toHaveLength(1);
    const created = customers()[0];
    expect(created?.salon_id).toBe(SALON_A.id);
    expect(created?.full_name).toBe("Nuevo Cliente");
    // Se guarda el teléfono crudo; phone_e164 se deriva a la forma canónica (como la BD).
    expect(created?.phone).toBe("600 123 456");
    expect(created?.phone_e164).toBe("+34600123456");
    // La cita apunta a la ficha recién creada.
    expect(appointments()[0]?.customer_id).toBe(created?.id);
  });

  it("la misma persona reserva dos veces con formatos distintos → una sola ficha (idempotente)", async () => {
    // 1ª reserva: no existe ⇒ crea.
    await createBooking(SALON_A.slug, bookingInput(SALON_A, "612345678"));
    // 2ª reserva: mismo número, otro formato ⇒ reutiliza (no crea otra).
    await createBooking(SALON_A.slug, bookingInput(SALON_A, "+34 612 34 56 78"));

    expect(customers()).toHaveLength(1); // una única ficha por teléfono canónico
    expect(appointments()).toHaveLength(2); // dos citas, la misma persona
    const only = customers()[0]?.id;
    expect(appointments().every((a) => a.customer_id === only)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) Carrera 23505 → se re-resuelve por teléfono y reutiliza, sin romper.
// ─────────────────────────────────────────────────────────────────────────────
describe("(c) carrera concurrente (23505) → se resuelve sin romper", () => {
  it("el pre-chequeo no ve la ficha ganadora, el INSERT choca (23505) y se re-resuelve reutilizándola", async () => {
    // Ficha ganadora ya presente (el rival la insertó), pero el PRIMER read por
    // teléfono la ocultará una vez → el código intenta INSERT, choca con el único
    // y re-resuelve por teléfono (ya visible) reutilizándola.
    seedCustomer({
      id: "cust-ganadora",
      salon_id: SALON_A.id,
      user_id: "user-ganador",
      full_name: "Ganadora",
      phone: "612345678", // canónico +34612345678
    });
    holder.hidePhoneOnce.add(`${SALON_A.id}::+34612345678`);

    // Sin email para que la identidad sea puramente por teléfono (la ventana de
    // carrera se aplica al read por phone_e164).
    const confirmation = await createBooking(SALON_A.slug, bookingInput(SALON_A, "612 34 56 78"));

    // La reserva SALE ADELANTE reutilizando la ficha ganadora (no un 500 espurio)…
    expect(confirmation.appointmentId).toEqual(expect.any(String));
    expect(appointments()[0]?.customer_id).toBe("cust-ganadora");
    // …y NO se duplicó (el INSERT que chocó no persistió nada).
    expect(customers()).toHaveLength(1);
    expect(customers()[0]?.user_id).toBe("user-ganador"); // ficha ganadora intacta
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) Multi-tenant: el mismo teléfono NO se cruza entre salones.
// ─────────────────────────────────────────────────────────────────────────────
describe("(d) no se cruzan salones (el único es por salón)", () => {
  it("el mismo teléfono existe en el salón B → reservar en A crea una ficha SEPARADA en A", async () => {
    // La persona ya es clienta del salón B con ese número.
    seedCustomer({
      id: "cust-en-b",
      salon_id: SALON_B.id,
      user_id: "user-comun",
      full_name: "En B",
      phone: "+34612345678",
    });

    // Reserva en el salón A con el MISMO número (otro formato): NO debe reutilizar la
    // ficha del salón B; crea una ficha propia del salón A.
    const confirmation = await createBooking(SALON_A.slug, bookingInput(SALON_A, "612 34 56 78"));

    expect(confirmation.appointmentId).toEqual(expect.any(String));
    // Ahora hay DOS fichas: una por salón, misma persona, sin cruce.
    expect(customers()).toHaveLength(2);
    const inA = customers().find((c) => c.salon_id === SALON_A.id);
    const inB = customers().find((c) => c.salon_id === SALON_B.id);
    expect(inA?.id).not.toBe("cust-en-b");
    expect(inB?.id).toBe("cust-en-b"); // la de B, intacta
    // La cita del salón A apunta a la ficha de A, jamás a la de B.
    expect(appointments()[0]?.salon_id).toBe(SALON_A.id);
    expect(appointments()[0]?.customer_id).toBe(inA?.id);
  });

  it("mismo teléfono con ficha en cada salón → cada reserva resuelve a la ficha de SU salón", async () => {
    seedCustomer({ id: "cust-a", salon_id: SALON_A.id, full_name: "En A", phone: "612345678" });
    seedCustomer({ id: "cust-b", salon_id: SALON_B.id, full_name: "En B", phone: "612345678" });

    const inA = await createBooking(SALON_A.slug, bookingInput(SALON_A, "+34 612 345 678"));
    const inB = await createBooking(SALON_B.slug, bookingInput(SALON_B, "0034612345678"));

    // Ninguna reserva creó fichas nuevas: cada una reutilizó la de su salón.
    expect(customers()).toHaveLength(2);
    expect(inA.appointmentId).toEqual(expect.any(String));
    expect(inB.appointmentId).toEqual(expect.any(String));

    const apptA = appointments().find((a) => a.salon_id === SALON_A.id);
    const apptB = appointments().find((a) => a.salon_id === SALON_B.id);
    expect(apptA?.customer_id).toBe("cust-a"); // A → ficha de A
    expect(apptB?.customer_id).toBe("cust-b"); // B → ficha de B
  });

  it("el doble modela el único parcial: dos fichas con el mismo teléfono en el MISMO salón chocan (23505)", async () => {
    // Sanity del doble (base de todo lo anterior): dentro de un salón, el segundo
    // INSERT del mismo número canónico es rechazado por el índice único parcial.
    const admin = makeClient();
    const first = await admin
      .from("customers")
      .insert({ salon_id: SALON_A.id, full_name: "X", phone: "612345678" })
      .select("*")
      .single();
    expect(first.error).toBeNull();

    const second = await admin
      .from("customers")
      .insert({ salon_id: SALON_A.id, full_name: "Y", phone: "+34 612 345 678" })
      .select("*")
      .single();
    expect(second.error).toMatchObject({ code: "23505" });

    // Y es PARCIAL + por salón: cross-salón coexiste (no choca).
    const other = await admin
      .from("customers")
      .insert({ salon_id: SALON_B.id, full_name: "Z", phone: "612345678" })
      .select("*")
      .single();
    expect(other.error).toBeNull();
  });
});

// Referencia de tipo para que `BookingError` no quede sin usar si se amplían casos.
void BookingError;
