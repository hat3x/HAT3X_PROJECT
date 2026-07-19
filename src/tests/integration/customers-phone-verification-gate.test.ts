/**
 * (sub-5) Suite de REGRESIÓN del contrato de VERIFICACIÓN DE TELÉFONO (gate OTP).
 *
 * El endurecimiento de FASE 3 (sub-1/2/3) exige que el enlace/creación de la ficha de
 * cliente por su cuenta —la CLAVE NATURAL es el teléfono— solo proceda si ese número
 * está probado como propio (OTP). Esta suite fija el CONTRATO COMPLETO de esa decisión
 * comprobando, en un mismo lugar, que el gate se aplica DONDE debe y NO donde no debe:
 *
 *   Parte 1 — SÍ se aplica al enlace SELF-SERVICE (`linkOrCreateCustomerAccount`):
 *     · teléfono CONFIRMADO que COINCIDE → enlaza/crea (created / linked / already_linked),
 *     · SIN teléfono confirmado           → `phone_not_verified` (403),
 *     · confirmado que NO coincide         → `phone_not_verified` (403),
 *     · comparación NORMALIZADA: confirmado '+34600111222' vs declarado '600 111 222'
 *       (dos formas del MISMO número) → coincide → pasa el gate.
 *
 *   Parte 2 — NO se aplica a la RESERVA por API PÚBLICA (`createBooking`): un visitante
 *     anónimo (sin sesión ni OTP) sigue pudiendo reservar; la ficha se crea/reutiliza por
 *     teléfono sin exigir verificación. El gate NO se filtró a este camino.
 *
 *   Parte 3 — NO se aplica al ALTA desde el PANEL (`createCustomer`, Server Action del
 *     staff): el personal sigue dando de alta fichas con teléfono sin OTP.
 *
 * Cada parte reutiliza el DOBLE ya probado de su hermano de test (el doble con estado de
 * `customers-account.test.ts`, el admin de reserva de `booking-customer-phone.test.ts` y
 * un doble mínimo de Server Action estilo `tenant-isolation.test.ts`), enchufados por un
 * `holder` reconfigurable por sección para no arrastrar base de datos real. Aquí se cubre
 * la "lógica de confianza del servidor"; la RLS/gates de Postgres se validan en su capa.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Row = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Contenedor izado por encima de los imports. Los mocks de módulo delegan SIEMPRE
// en `holder`, y cada sección instala en él el doble que necesita (patrón idéntico
// a `holder.admin` de booking-customer-phone.test.ts y `holder.supabase` de
// tenant-isolation.test.ts). Así un único juego de `vi.mock` sirve a las 3 partes.
// ─────────────────────────────────────────────────────────────────────────────
const holder = vi.hoisted(() => ({
  // Parte 1 (doble con estado): BD en memoria + usuario autenticado del gate OTP.
  store: new Map<string, Row[]>(),
  currentUser: null as
    | { id: string; phone?: string; phone_confirmed_at?: string }
    | null,
  idCounter: 0,
  // Fábricas de cliente reconfigurables por sección (server = sesión/RLS, admin = service role).
  makeServer: null as null | (() => unknown),
  makeAdmin: null as null | (() => unknown),
  // Parte 3: salón activo que resuelve el Server Action del panel.
  activeSalonId: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => holder.makeServer!() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => holder.makeAdmin!() }));
vi.mock("@/lib/salon", () => ({
  getActiveSalonId: () => Promise.resolve(holder.activeSalonId),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ═════════════════════════════════════════════════════════════════════════════
// DOBLE CON ESTADO (Parte 1) — BD en memoria fiel a `.eq/.is/.order/.insert/…`.
// Copia del doble probado en customers-account.test.ts: las aserciones son "el
// código leyó/escribió lo correcto", no "el mock devolvió lo que le dije".
// ═════════════════════════════════════════════════════════════════════════════
interface Pending {
  op: "insert" | "update" | "delete";
  payload: Row | Row[] | null;
}

function makeBuilder(table: string) {
  const rows = (): Row[] => {
    if (!holder.store.has(table)) holder.store.set(table, []);
    return holder.store.get(table) as Row[];
  };

  const filters: Array<(row: Row) => boolean> = [];
  let orderCol: string | null = null;
  let orderAsc = true;
  let pending: Pending | null = null;

  const apply = (list: Row[]): Row[] => list.filter((r) => filters.every((f) => f(r)));

  function runRead(): Row[] {
    let list = apply(rows());
    if (orderCol !== null) {
      const col = orderCol;
      list = [...list].sort((a, b) => {
        const [av, bv] = [String(a[col]), String(b[col])];
        const c = av < bv ? -1 : av > bv ? 1 : 0;
        return orderAsc ? c : -c;
      });
    }
    return list;
  }

  function runWrite(): Row[] {
    if (pending === null) return runRead();
    const payloads: Row[] = Array.isArray(pending.payload)
      ? pending.payload
      : pending.payload === null
        ? []
        : [pending.payload];

    if (pending.op === "insert") {
      return payloads.map((p) => {
        const row: Row = { id: p.id ?? `${table}-${++holder.idCounter}`, ...p };
        rows().push(row);
        return row;
      });
    }
    const targets = apply(rows());
    for (const r of targets) Object.assign(r, pending.payload as Row);
    return targets;
  }

  const resolveList = (): { data: Row[]; error: null } => ({
    data: pending !== null ? runWrite() : runRead(),
    error: null,
  });
  const resolveSingle = (): { data: Row | null; error: null } => ({
    data: resolveList().data[0] ?? null,
    error: null,
  });

  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return b;
    },
    is: (col: string, _val: null) => {
      filters.push((r) => r[col] === null || r[col] === undefined);
      return b;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      orderAsc = opts?.ascending ?? true;
      return b;
    },
    insert: (payload: Row | Row[]) => {
      pending = { op: "insert", payload };
      return b;
    },
    update: (payload: Row) => {
      pending = { op: "update", payload };
      return b;
    },
    maybeSingle: () => Promise.resolve(resolveSingle()),
    single: () => Promise.resolve(resolveSingle()),
    then: (onFulfilled: (v: { data: Row[]; error: null }) => unknown) =>
      onFulfilled(resolveList()),
  };
  return b;
}

function statefulClient() {
  return {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: holder.currentUser }, error: null }),
    },
  };
}

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];

// ═════════════════════════════════════════════════════════════════════════════
// DOBLE ADMIN DE RESERVA (Parte 2) — laxo, devuelve fixtures por tabla y REGISTRA
// los INSERT. Copia del probado en booking-customer-phone.test.ts.
// ═════════════════════════════════════════════════════════════════════════════
interface Fixtures {
  salons?: unknown;
  services?: unknown;
  professional_services?: unknown[];
  professional_schedules?: unknown[];
  schedule_exceptions?: unknown;
  appointment_blocks?: unknown[];
  customers?: unknown;
  professionals?: unknown;
  onInsert?: (table: string, payload: Record<string, unknown>) => unknown;
}

function makeBookingAdmin(fx: Fixtures) {
  function builder(table: string) {
    let pendingInsert: Record<string, unknown> | null = null;

    function currentData(): { data: unknown; error: unknown } {
      if (pendingInsert) {
        const row = fx.onInsert?.(table, pendingInsert) ?? null;
        return { data: row, error: null };
      }
      const raw = (fx as Record<string, unknown>)[table];
      const resolved = typeof raw === "function" ? (raw as () => unknown)() : raw;
      return { data: resolved ?? [], error: null };
    }

    function resolveSingle() {
      const { data, error } = currentData();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
    }

    const b = {
      select: () => b,
      eq: () => b,
      filter: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: Record<string, unknown>) => {
        pendingInsert = payload;
        return b;
      },
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(currentData()),
    };
    return b;
  }
  return { from: (table: string) => builder(table) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports de lo que se prueba (después de los mocks: se resuelven ya intervenidos).
// ─────────────────────────────────────────────────────────────────────────────
import {
  CustomerAccountError,
  linkOrCreateCustomerAccount,
} from "@/lib/customers/account";
import { createBooking } from "@/lib/booking/server";
import type { CreateBookingInput } from "@/lib/booking/schema";
import { createCustomer } from "@/app/(dashboard)/customers/actions";

afterEach(() => {
  holder.currentUser = null;
  holder.activeSalonId = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 1 — El gate OTP SÍ blinda el enlace self-service.
// ═════════════════════════════════════════════════════════════════════════════
describe("(sub-5) gate OTP en linkOrCreateCustomerAccount", () => {
  const SALON = "salon-a";
  const USER = "user-ana";
  const PHONE_E164 = "+34612345678"; // forma canónica declarada
  const PHONE_AUTH = "34612345678"; // como la guarda GoTrue (E.164 SIN '+')

  /** Cuenta con el teléfono confirmado por OTP e igual a PHONE_E164. */
  function verifiedAna() {
    holder.currentUser = {
      id: USER,
      phone: PHONE_AUTH,
      phone_confirmed_at: "2026-01-01T00:00:00Z",
    };
  }

  beforeEach(() => {
    holder.store = new Map<string, Row[]>();
    holder.idCounter = 0;
    holder.makeServer = () => statefulClient();
    holder.makeAdmin = () => statefulClient();
    // Salón con 'loyalty' activo (el alta de ficha dispara el bootstrap de puntos).
    // SIN fila en salon_security_settings ⇒ el gate es fail-closed: EXIGE verificación.
    holder.store.set("salons", [{ id: SALON }]);
    holder.store.set("salon_features", [
      { salon_id: SALON, feature: "loyalty", enabled: true },
    ]);
    holder.store.set("customers", []);
    verifiedAna();
  });

  it("CONFIRMADO que coincide → CREATED (no existía ficha con ese teléfono)", async () => {
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON,
      user_id: USER,
      phone: "612 34 56 78", // formato libre → +34612345678 = el confirmado
      full_name: "Ana",
    });
    expect(result.outcome).toBe("created");
    expect(result.customer.user_id).toBe(USER);
    expect(rowsOf("customers")).toHaveLength(1);
  });

  it("CONFIRMADO que coincide → LINKED (ficha existente sin cuenta se enlaza)", async () => {
    rowsOf("customers").push({
      id: "cust-ana",
      salon_id: SALON,
      full_name: "Ana",
      user_id: null,
      phone_e164: PHONE_E164,
    });
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON,
      user_id: USER,
      phone: "+34 612 345 678",
      full_name: "Ana",
    });
    expect(result.outcome).toBe("linked");
    expect(result.customer.id).toBe("cust-ana");
    expect(result.customer.user_id).toBe(USER);
    expect(rowsOf("customers")).toHaveLength(1); // no duplica
  });

  it("CONFIRMADO que coincide → ALREADY_LINKED (no-op idempotente en la misma cuenta)", async () => {
    rowsOf("customers").push({
      id: "cust-ana",
      salon_id: SALON,
      full_name: "Ana",
      user_id: USER,
      phone_e164: PHONE_E164,
    });
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON,
      user_id: USER,
      phone: PHONE_E164,
      full_name: "Ana",
    });
    expect(result.outcome).toBe("already_linked");
    expect(result.customer.id).toBe("cust-ana");
    expect(rowsOf("customers")).toHaveLength(1);
  });

  it("SIN teléfono confirmado → phone_not_verified (403) y no crea ficha", async () => {
    holder.currentUser = { id: USER }; // sin phone / phone_confirmed_at
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON,
        user_id: USER,
        phone: PHONE_E164,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "phone_not_verified", status: 403 });
    expect(rowsOf("customers")).toHaveLength(0);
  });

  it("CONFIRMADO pero que NO coincide → phone_not_verified (403) (anti-suplantación)", async () => {
    holder.currentUser = {
      id: USER,
      phone: "34600000000", // confirmado, pero NO es el que declara
      phone_confirmed_at: "2026-01-01T00:00:00Z",
    };
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON,
        user_id: USER,
        phone: PHONE_E164, // +34612345678
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "phone_not_verified", status: 403 });
    expect(rowsOf("customers")).toHaveLength(0);
  });

  it("el fallo del gate es un CustomerAccountError (no un error opaco)", async () => {
    holder.currentUser = { id: USER };
    const err = await linkOrCreateCustomerAccount({
      salon_id: SALON,
      user_id: USER,
      phone: PHONE_E164,
      full_name: "Ana",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CustomerAccountError);
  });

  it("COMPARACIÓN NORMALIZADA: confirmado '+34600111222' vs declarado '600 111 222' → COINCIDE", async () => {
    // Dos formas del MISMO número: el confirmado en E.164 internacional (GoTrue lo guarda
    // como '34600111222', sin '+') y el declarado en formato NACIONAL con espacios. Ambos
    // normalizan a '+34600111222', así que el gate los reconoce iguales y deja pasar.
    holder.currentUser = {
      id: USER,
      phone: "34600111222",
      phone_confirmed_at: "2026-01-01T00:00:00Z",
    };
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON,
      user_id: USER,
      phone: "600 111 222",
      full_name: "Ana",
    });
    expect(result.outcome).toBe("created"); // pasó el gate: la normalización hizo coincidir
    expect(rowsOf("customers")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 2 — La reserva por API PÚBLICA NO exige verificación de teléfono.
// ═════════════════════════════════════════════════════════════════════════════
describe("(sub-5) la reserva pública sigue SIN verificación de teléfono", () => {
  const TZ = "Europe/Madrid";
  const DATE = "2025-06-09"; // lunes (weekday 1)
  const SLUG = "salon-test";
  const SALON_ID = "salon-1";
  const SERVICE_ID = "00000000-0000-0000-0000-0000000000aa";
  const PRO_ID = "11111111-1111-1111-1111-1111111111bb";
  const AT_FREE = "2025-06-09T09:00:00.000Z"; // 11:00 Madrid, dentro de 09:00–17:00

  function setupBooking(overrides: Partial<Fixtures> = {}): {
    inserts: { table: string; payload: Record<string, unknown> }[];
  } {
    const inserts: { table: string; payload: Record<string, unknown> }[] = [];
    const fx: Fixtures = {
      salons: {
        id: SALON_ID,
        name: "Salón de Pruebas",
        slug: SLUG,
        timezone: TZ,
        active: true,
        settings: { slot_interval_minutes: 30, min_lead_minutes: 0 },
      },
      services: {
        id: SERVICE_ID,
        name: "Corte",
        application_min: 30,
        exposure_min: 0,
        post_exposure_min: 0,
        price_cents: 2000,
        currency: "EUR",
        active: true,
      },
      professional_services: [
        { professional_id: PRO_ID, professionals: { active: true } },
      ],
      professional_schedules: [
        { weekday: 1, start_time: "09:00:00", end_time: "17:00:00" },
      ],
      schedule_exceptions: null,
      appointment_blocks: [],
      customers: null, // por defecto: no existe → se crea
      professionals: { full_name: "Ana" },
      onInsert: (table, payload) => {
        inserts.push({ table, payload });
        if (table === "customers") return { id: "cust-nuevo" };
        if (table === "appointments")
          return { id: "appt-1", starts_at: payload.starts_at, ends_at: payload.ends_at };
        return null;
      },
      ...overrides,
    };
    const admin = makeBookingAdmin(fx);
    holder.makeAdmin = () => admin;
    return { inserts };
  }

  function bookingInput(phone: string): CreateBookingInput {
    return {
      serviceId: SERVICE_ID,
      professionalId: "any",
      startsAt: AT_FREE,
      customer: {
        fullName: "Cliente Prueba",
        email: "cliente@example.com",
        phone,
        marketingConsent: false,
      },
    };
  }

  const apptCustomerId = (
    inserts: { table: string; payload: Record<string, unknown> }[],
  ): unknown => inserts.find((i) => i.table === "appointments")?.payload.customer_id;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${DATE}T00:00:00.000Z`));
    holder.currentUser = null; // visitante ANÓNIMO: ni sesión ni OTP
  });

  afterEach(() => {
    vi.useRealTimers();
    holder.makeAdmin = null;
  });

  it("un anónimo (sin sesión ni OTP) CREA su ficha por teléfono y reserva", async () => {
    const { inserts } = setupBooking({ customers: null });
    const confirmation = await createBooking(SLUG, bookingInput("600123456"));

    expect(confirmation.appointmentId).toBe("appt-1");
    // La ficha se creó sin pasar por ningún gate de verificación de teléfono.
    const customerInsert = inserts.find((i) => i.table === "customers");
    expect(customerInsert).toBeDefined();
    expect(customerInsert?.payload.phone).toBe("600123456");
    expect(apptCustomerId(inserts)).toBe("cust-nuevo");
  });

  it("reutiliza la ficha existente por teléfono, también sin verificación", async () => {
    const { inserts } = setupBooking({
      customers: { id: "cust-existente", user_id: "user-9", full_name: "Nombre Previo" },
    });
    const confirmation = await createBooking(SLUG, bookingInput("612 34 56 78"));

    expect(confirmation.appointmentId).toBe("appt-1");
    expect(apptCustomerId(inserts)).toBe("cust-existente");
    // Ni se creó otra ficha ni se exigió OTP: el gate no toca este camino.
    expect(inserts.some((i) => i.table === "customers")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PARTE 3 — El alta de cliente desde el PANEL (staff) sigue funcionando.
// ═════════════════════════════════════════════════════════════════════════════
describe("(sub-5) el alta de cliente desde el panel sigue funcionando", () => {
  const SALON_ID = "salon-panel";

  /** Doble mínimo de Server Action: captura el INSERT y devuelve la fila con id. */
  function panelServer(captured: { payload?: Row }) {
    const b = {
      insert: (payload: Row) => {
        captured.payload = payload;
        return b;
      },
      select: () => b,
      single: () =>
        Promise.resolve({ data: { id: "cust-panel", ...captured.payload }, error: null }),
    };
    return { from: () => b };
  }

  beforeEach(() => {
    holder.activeSalonId = SALON_ID;
  });

  it("el staff da de alta una ficha con teléfono SIN pasar por OTP", async () => {
    const captured: { payload?: Row } = {};
    holder.makeServer = () => panelServer(captured);

    const result = await createCustomer({
      full_name: "Ana Panel",
      phone: "600 111 222",
      marketing_consent: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe("cust-panel");
    }
    // Se acotó al salón activo y se guardó el teléfono tal cual (sin gate de verificación).
    expect(captured.payload?.salon_id).toBe(SALON_ID);
    expect(captured.payload?.phone).toBe("600 111 222");
  });

  it("sin salón activo devuelve error de dominio (no lanza), sin tocar OTP", async () => {
    holder.activeSalonId = null;
    holder.makeServer = () => panelServer({});

    const result = await createCustomer({
      full_name: "Ana Panel",
      phone: "600 111 222",
      marketing_consent: false,
    });
    expect(result).toMatchObject({ ok: false });
  });
});
