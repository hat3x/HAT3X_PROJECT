/**
 * IDENTIFICAR al cliente por teléfono (`@/lib/reception/identify`).
 *
 * Cubre el paso con el que el recepcionista IA reconoce a quien llama: teléfono →
 * `{ found, customer?, upcoming? }` acotado al salón de la clave. Contratos que se prueban:
 *
 *   · AISLAMIENTO multi-tenant (lo crítico): TODA lectura —`customers` y `appointments`—
 *     lleva el `salon_id` recibido en sus filtros. Es la única barrera de tenant con el
 *     cliente admin (omite RLS), así que se verifica en cada consulta.
 *   · REUTILIZA `normalizePhone`: se busca por la forma canónica E.164 (misma que la
 *     columna generada `phone_e164` y su índice único), no por lo que teclee la persona.
 *   · Sin número real ⇒ `{ found: false }` SIN tocar la BD (no puede haber coincidencia).
 *   · Ficha inexistente ⇒ `{ found: false }` y NO se consultan citas (nada que devolver).
 *   · Con ficha ⇒ `found:true` + `customer {id,full_name}` + `upcoming` aplanado; solo la
 *     agenda VIVA (`pending`/`confirmed`), de `now` en adelante y ordenada por inicio.
 *   · Mínima exposición: aunque la fila traiga de más, del cliente SOLO salen `id` y
 *     `full_name` (nunca teléfono/email).
 *   · Embeds robustos: servicio/profesional ausente ⇒ `null` (no rompe ni inventa `""`).
 *   · Fallo REAL de consulta ⇒ `ReceptionError` `INTERNAL_ERROR` (500) sin filtrar la causa.
 *
 * Se inyecta un cliente admin FALSO que enruta `customers` (maybeSingle) y `appointments`
 * (termina en `.order`), capturando columnas/filtros/orden por tabla para auditarlos.
 */
import { describe, it, expect } from "vitest";

import { ReceptionError } from "@/lib/reception/errors";
import {
  identifyCustomer,
  type IdentifyCustomerDeps,
} from "@/lib/reception/identify";

// -----------------------------------------------------------------------------
// Cliente admin FALSO — enruta customers (maybeSingle) y appointments (order).
// -----------------------------------------------------------------------------

type Admin = NonNullable<IdentifyCustomerDeps["admin"]>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

/** Una lectura capturada: columnas proyectadas, filtros aplicados y orden (si lo hubo). */
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
  order?: { column: string; ascending: boolean };
}

interface FakeConfig {
  /** Resultado de la búsqueda por (salon_id, phone_e164) en `customers`. */
  customer?: QueryResult;
  /** Si es true, la lectura de `customers` LANZA (simula fallo de red/DB). */
  customerThrows?: boolean;
  /** Resultado de la consulta de próximas citas (`appointments`). */
  appointments?: QueryResult;
  /** Si es true, la lectura de `appointments` LANZA. */
  appointmentsThrows?: boolean;
}

/**
 * Cliente admin falso. `from("customers")` encadena `.select().eq()…maybeSingle()`;
 * `from("appointments")` encadena `.select().eq().in().gte().order()` (terminal awaitable).
 * Cada terminal registra su `SelectCall` para poder auditar columnas, filtros y orden.
 */
function fakeAdmin(config: FakeConfig): {
  admin: Admin;
  customerCalls: SelectCall[];
  appointmentCalls: SelectCall[];
} {
  const customerCalls: SelectCall[] = [];
  const appointmentCalls: SelectCall[] = [];

  const client = {
    from(table: string) {
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
          order(col: string, opts: { ascending: boolean }) {
            // Desde que un teléfono puede ser de toda una familia, la búsqueda
            // devuelve LISTA ordenada y no una fila: `maybeSingle()` reventaría
            // con dos hermanos.
            customerCalls.push({
              columns,
              filters: { ...filters },
              order: { column: col, ascending: opts.ascending },
            });
            if (config.customerThrows === true) {
              return Promise.reject(new Error("fallo al leer customers"));
            }
            return Promise.resolve(config.customer ?? { data: [], error: null });
          },
        };
        return builder;
      }
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
          in(col: string, vals: unknown) {
            filters[`in:${col}`] = vals;
            return builder;
          },
          gte(col: string, val: unknown) {
            filters[`gte:${col}`] = val;
            return builder;
          },
          order(col: string, opts: { ascending: boolean }) {
            appointmentCalls.push({
              columns,
              filters: { ...filters },
              order: { column: col, ascending: opts.ascending },
            });
            if (config.appointmentsThrows === true) {
              return Promise.reject(new Error("fallo al leer appointments"));
            }
            return Promise.resolve(config.appointments ?? { data: [], error: null });
          },
        };
        return builder;
      }
      throw new Error(`fakeAdmin: tabla inesperada '${table}'`);
    },
  };

  return { admin: client as unknown as Admin, customerCalls, appointmentCalls };
}

const SALON = "salon-9";
const NOW = () => new Date("2026-07-23T10:00:00.000Z");
const NOW_ISO = "2026-07-23T10:00:00.000Z";

/** Fila de una ficha existente (con campos de MÁS para probar la mínima exposición). */
const CUSTOMER_ROW: QueryResult = {
  data: [{ id: "cust-1", full_name: "Ana Ruiz", phone: "+34612345678", email: "ana@x.com" }],
  error: null,
};

/** Dos hermanos con el mismo móvil: el caso que antes la base prohibía. */
const FAMILIA: QueryResult = {
  data: [
    { id: "cust-1", full_name: "Ana Ruiz" },
    { id: "cust-2", full_name: "Santiago Ruiz" },
  ],
  error: null,
};

/** Dos citas próximas ya con sus embeds to-one resueltos. */
const TWO_UPCOMING: QueryResult = {
  data: [
    {
      id: "apt-1",
      starts_at: "2026-07-24T09:00:00.000Z",
      status: "confirmed",
      service: { name: "Corte" },
      professional: { full_name: "Marta" },
    },
    {
      id: "apt-2",
      starts_at: "2026-07-25T11:30:00.000Z",
      status: "pending",
      service: { name: "Tinte" },
      professional: { full_name: "Luis" },
    },
  ],
  error: null,
};

// -----------------------------------------------------------------------------
// found: false
// -----------------------------------------------------------------------------

describe("identifyCustomer — no reconoce (found: false)", () => {
  it("teléfono sin número real ⇒ { found: false } SIN tocar la BD", async () => {
    const { admin, customerCalls, appointmentCalls } = fakeAdmin({});

    const result = await identifyCustomer(SALON, "sin teléfono", { admin, now: NOW });

    expect(result).toEqual({ found: false });
    // No hay forma canónica que casar: no se consulta nada.
    expect(customerCalls).toHaveLength(0);
    expect(appointmentCalls).toHaveLength(0);
  });

  it("ficha inexistente ⇒ { found: false } y NO consulta citas", async () => {
    const { admin, customerCalls, appointmentCalls } = fakeAdmin({
      customer: { data: [], error: null },
    });

    const result = await identifyCustomer(SALON, "612345678", { admin, now: NOW });

    expect(result).toEqual({ found: false });
    // Buscó la ficha (acotada al salón + teléfono canónico)…
    expect(customerCalls).toHaveLength(1);
    expect(customerCalls[0]!.filters).toEqual({ salon_id: SALON, phone_e164: "+34612345678" });
    // …pero sin ficha no hay a quién mirarle la agenda.
    expect(appointmentCalls).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// found: true
// -----------------------------------------------------------------------------

describe("identifyCustomer — reconoce (found: true)", () => {
  it("devuelve customer {id,full_name} + upcoming aplanado y ordenado", async () => {
    const { admin, appointmentCalls } = fakeAdmin({
      customer: CUSTOMER_ROW,
      appointments: TWO_UPCOMING,
    });

    const result = await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(result).toEqual({
      found: true,
      customer: { id: "cust-1", full_name: "Ana Ruiz" },
      upcoming: [
        {
          id: "apt-1",
          starts_at: "2026-07-24T09:00:00.000Z",
          service_name: "Corte",
          professional_name: "Marta",
          status: "confirmed",
        },
        {
          id: "apt-2",
          starts_at: "2026-07-25T11:30:00.000Z",
          service_name: "Tinte",
          professional_name: "Luis",
          status: "pending",
        },
      ],
    });

    // La agenda se pidió VIVA, de `now` en adelante y ordenada por inicio ascendente.
    expect(appointmentCalls).toHaveLength(1);
    expect(appointmentCalls[0]!.filters).toEqual({
      salon_id: SALON,
      customer_id: "cust-1",
      "in:status": ["pending", "confirmed"],
      "gte:starts_at": NOW_ISO,
    });
    expect(appointmentCalls[0]!.order).toEqual({ column: "starts_at", ascending: true });
  });

  it("mínima exposición: del cliente SOLO salen id y full_name (nunca phone/email)", async () => {
    const { admin } = fakeAdmin({ customer: CUSTOMER_ROW, appointments: { data: [], error: null } });

    const result = await identifyCustomer(SALON, "612345678", { admin, now: NOW });

    expect(result.customer).toEqual({ id: "cust-1", full_name: "Ana Ruiz" });
    expect(result.customer).not.toHaveProperty("phone");
    expect(result.customer).not.toHaveProperty("email");
  });

  it("sin próximas citas ⇒ found:true con upcoming vacío", async () => {
    const { admin } = fakeAdmin({ customer: CUSTOMER_ROW, appointments: { data: [], error: null } });

    const result = await identifyCustomer(SALON, "612345678", { admin, now: NOW });

    expect(result).toEqual({
      found: true,
      customer: { id: "cust-1", full_name: "Ana Ruiz" },
      upcoming: [],
    });
  });
});

// -----------------------------------------------------------------------------
// Aislamiento multi-tenant — el salon_id viaja en TODAS las lecturas
// -----------------------------------------------------------------------------

describe("identifyCustomer — aislamiento por salón (nunca datos de otro salón)", () => {
  it("acota por el salon_id recibido tanto en customers como en appointments", async () => {
    const { admin, customerCalls, appointmentCalls } = fakeAdmin({
      customer: CUSTOMER_ROW,
      appointments: TWO_UPCOMING,
    });

    await identifyCustomer("salon-OTRO", "612345678", { admin, now: NOW });

    expect(customerCalls[0]!.filters.salon_id).toBe("salon-OTRO");
    expect(appointmentCalls[0]!.filters.salon_id).toBe("salon-OTRO");
  });
});

// -----------------------------------------------------------------------------
// normalizePhone — se busca por la forma canónica E.164
// -----------------------------------------------------------------------------

describe("identifyCustomer — reutiliza normalizePhone (busca por E.164 canónico)", () => {
  it.each([
    ["612345678", "+34612345678"],
    ["+34 612 34 56 78", "+34612345678"],
    ["0034612345678", "+34612345678"],
    ["(612) 345-678", "+34612345678"],
  ])("normaliza %s → %s antes de consultar phone_e164", async (input, canonical) => {
    const { admin, customerCalls } = fakeAdmin({ customer: { data: [], error: null } });

    await identifyCustomer(SALON, input, { admin, now: NOW });

    expect(customerCalls[0]!.filters.phone_e164).toBe(canonical);
  });
});

// -----------------------------------------------------------------------------
// Embeds robustos — servicio/profesional ausente ⇒ null
// -----------------------------------------------------------------------------

describe("identifyCustomer — embeds to-one robustos", () => {
  it("servicio/profesional null o en forma de array ⇒ resuelve a name o null", async () => {
    const { admin } = fakeAdmin({
      customer: CUSTOMER_ROW,
      appointments: {
        data: [
          // embed ausente (null) ⇒ null, sin romper ni inventar "".
          {
            id: "apt-3",
            starts_at: "2026-07-24T09:00:00.000Z",
            status: "confirmed",
            service: null,
            professional: null,
          },
          // embed como array de uno (variación de tipado) ⇒ coge el primero.
          {
            id: "apt-4",
            starts_at: "2026-07-24T12:00:00.000Z",
            status: "pending",
            service: [{ name: "Peinado" }],
            professional: [{ full_name: "Sara" }],
          },
        ],
        error: null,
      },
    });

    const result = await identifyCustomer(SALON, "612345678", { admin, now: NOW });

    expect(result.upcoming).toEqual([
      {
        id: "apt-3",
        starts_at: "2026-07-24T09:00:00.000Z",
        service_name: null,
        professional_name: null,
        status: "confirmed",
      },
      {
        id: "apt-4",
        starts_at: "2026-07-24T12:00:00.000Z",
        service_name: "Peinado",
        professional_name: "Sara",
        status: "pending",
      },
    ]);
  });
});

// -----------------------------------------------------------------------------
// Errores — fallo REAL de consulta ⇒ INTERNAL_ERROR 500 sin filtrar la causa
// -----------------------------------------------------------------------------

describe("identifyCustomer — 500 INTERNAL_ERROR (sin fuga de la causa interna)", () => {
  it("error al leer customers ⇒ ReceptionError INTERNAL_ERROR y sin exponer el detalle", async () => {
    const { admin, appointmentCalls } = fakeAdmin({
      customer: { data: null, error: { code: "42P01", message: "postgres: relation customers" } },
    });

    let caught: unknown;
    try {
      await identifyCustomer(SALON, "612345678", { admin, now: NOW });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ReceptionError);
    expect(caught).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect((caught as ReceptionError).message).not.toContain("42P01");
    // Falló al identificar: ni se intentó la agenda.
    expect(appointmentCalls).toHaveLength(0);
  });

  it("error al leer appointments ⇒ ReceptionError INTERNAL_ERROR sin filtrar el detalle", async () => {
    const { admin } = fakeAdmin({
      customer: CUSTOMER_ROW,
      appointments: { data: null, error: { code: "42P01", message: "postgres: relation appointments" } },
    });

    let caught: unknown;
    try {
      await identifyCustomer(SALON, "612345678", { admin, now: NOW });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ReceptionError);
    expect(caught).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect((caught as ReceptionError).message).not.toContain("42P01");
  });
});

// -----------------------------------------------------------------------------
// Un teléfono es de una FAMILIA
//
// Desde que varias fichas pueden compartir número, identificar deja de tener
// siempre una respuesta. Cuando no la tiene, Sara pregunta — con los nombres,
// que es lo que hace una recepcionista humana ("¿hablo con Ana o con
// Santiago?").
// -----------------------------------------------------------------------------

describe("identifyCustomer · familias que comparten teléfono", () => {
  it("con UNA ficha, el contrato no cambia: found + customer + upcoming", async () => {
    // Es el 90 % de las llamadas. Que existan las familias no puede cambiarle
    // el comportamiento al caso normal.
    const { admin } = fakeAdmin({ customer: CUSTOMER_ROW, appointments: { data: [], error: null } });
    const r = await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(r.found).toBe(true);
    expect(r.customer).toEqual({ id: "cust-1", full_name: "Ana Ruiz" });
    expect(r.ambiguous).toBeUndefined();
  });

  it("con VARIAS fichas, avisa de la ambiguedad y da los nombres", async () => {
    const { admin } = fakeAdmin({ customer: FAMILIA });
    const r = await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(r.found).toBe(true);
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toEqual([
      { id: "cust-1", full_name: "Ana Ruiz" },
      { id: "cust-2", full_name: "Santiago Ruiz" },
    ]);
  });

  it("siendo ambiguo NO devuelve un cliente elegido a dedo", async () => {
    // El fallo grave: dar por buena a la primera ficha y contarle a quien llama
    // las citas de su hermano.
    const { admin } = fakeAdmin({ customer: FAMILIA });
    const r = await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(r.customer).toBeUndefined();
  });

  it("siendo ambiguo NO consulta citas de nadie", async () => {
    // Sin saber de quién es la llamada, mirar la agenda de alguien es filtrar
    // datos de un tercero — aunque viva en la misma casa.
    const { admin, appointmentCalls } = fakeAdmin({ customer: FAMILIA });
    await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(appointmentCalls).toHaveLength(0);
  });

  it("la busqueda sigue acotada al salon", async () => {
    const { admin, customerCalls } = fakeAdmin({ customer: FAMILIA });
    await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(customerCalls[0]?.filters.salon_id).toBe(SALON);
  });

  it("los candidatos salen en orden estable, para que Sara los lea igual siempre", async () => {
    const { admin, customerCalls } = fakeAdmin({ customer: FAMILIA });
    await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    expect(customerCalls[0]?.order).toEqual({ column: "full_name", ascending: true });
  });

  it("de los candidatos solo salen id y nombre, nunca telefono ni email", async () => {
    const conDeMas: QueryResult = {
      data: [
        { id: "a", full_name: "Ana Ruiz", phone: "+34612345678", email: "ana@x.com" },
        { id: "b", full_name: "Santiago Ruiz", phone: "+34612345678", email: "s@x.com" },
      ],
      error: null,
    };
    const { admin } = fakeAdmin({ customer: conDeMas });
    const r = await identifyCustomer(SALON, "612 34 56 78", { admin, now: NOW });

    for (const c of r.candidates ?? []) {
      expect(Object.keys(c).sort()).toEqual(["full_name", "id"]);
    }
  });
});
