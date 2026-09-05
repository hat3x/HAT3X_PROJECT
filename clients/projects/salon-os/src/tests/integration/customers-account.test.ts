/**
 * Tests de integración del alta/enlace de cliente (`@/lib/customers/account`).
 *
 * Como en `loyalty-server.test.ts`, se sustituye Supabase por un DOBLE CON ESTADO
 * (una BD en memoria que aplica de verdad `.eq/.is/.order` y persiste escrituras),
 * de modo que las aserciones son "el código leyó/escribió lo correcto", no "el mock
 * devolvió lo que le dije". La RLS real de Postgres se valida en la capa de BD
 * (migraciones + guardianes); aquí se cubre la "lógica de confianza del servidor":
 *   · que `linkOrCreateCustomerAccount` es IDEMPOTENTE y aplica bien las tres ramas
 *     (crear / enlazar / no-op) y el CONFLICTO de teléfono ajeno,
 *   · que solo se puede vincular/consultar la PROPIA cuenta (nunca la de un tercero),
 *   · que el teléfono se NORMALIZA a E.164 antes de buscar/crear,
 *   · que las consultas se acotan por `salon_id` (no se cruza de salón).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  store: new Map<string, Row[]>(),
  // El gate OTP lee `phone` / `phone_confirmed_at` del usuario (como `auth.getUser()`).
  currentUser: null as
    | { id: string; phone?: string; phone_confirmed_at?: string }
    | null,
  idCounter: 0,
}));

interface Pending {
  op: "insert" | "update" | "delete";
  payload: Row | Row[] | null;
}

/** Builder mínimo pero fiel del query builder de Supabase sobre la BD en memoria. */
function makeBuilder(table: string) {
  const rows = (): Row[] => {
    if (!holder.store.has(table)) holder.store.set(table, []);
    return holder.store.get(table) as Row[];
  };

  const filters: Array<(row: Row) => boolean> = [];
  let orderCol: string | null = null;
  let orderAsc = true;
  let limitN: number | null = null;
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
    if (limitN !== null) list = list.slice(0, limitN);
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
    if (pending.op === "update") {
      const targets = apply(rows());
      for (const r of targets) Object.assign(r, pending.payload as Row);
      return targets;
    }
    // delete (no usado aquí, pero se deja por fidelidad)
    const removed = apply(rows());
    holder.store.set(
      table,
      rows().filter((r) => !filters.every((f) => f(r))),
    );
    return removed;
  }

  const resolveList = (): { data: Row[]; error: null } => ({
    data: pending !== null ? runWrite() : runRead(),
    error: null,
  });

  const resolveSingle = (): { data: Row | null; error: null } => {
    const { data } = resolveList();
    return { data: data[0] ?? null, error: null };
  };

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
    limit: (n: number) => {
      limitN = n;
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
    then: (onFulfilled: (v: { data: Row[]; error: null }) => unknown) => onFulfilled(resolveList()),
  };
  return b;
}

function makeClient() {
  return {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: holder.currentUser }, error: null }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

import {
  CustomerAccountError,
  findCustomerByPhone,
  getMyCustomer,
  getMyCustomerForSalon,
  linkOrCreateCustomerAccount,
} from "@/lib/customers/account";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario: dos salones, dos usuarios/clientes.
// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "salon-a";
const SALON_B = "salon-b";
const USER_ANA = "user-ana";
const USER_BEA = "user-bea";
const PHONE_ANA = "+34612345678"; // forma canónica E.164
// GoTrue guarda auth.users.phone en E.164 pero SIN el '+' de cabecera; el gate OTP se lo
// antepone para normalizar. Es el MISMO número que PHONE_ANA (su forma "de cuenta").
const PHONE_ANA_AUTH = "34612345678";

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];

/**
 * Deja un salón SIN fidelización activa (el gate trata igual ambas formas):
 *   · "absent"   — sin fila en salon_features (add-on no contratado, opt-in).
 *   · "disabled" — fila con enabled=false (contratado pero pausado).
 */
function disableLoyalty(salonId = SALON_A, mode: "absent" | "disabled" = "absent"): void {
  const rows = rowsOf("salon_features");
  if (mode === "absent") {
    holder.store.set(
      "salon_features",
      rows.filter((r) => r.salon_id !== salonId),
    );
  } else {
    for (const r of rows) if (r.salon_id === salonId) r.enabled = false;
  }
}

/** Reinicia la BD en memoria y siembra los dos salones (sin fichas todavía). */
function seedBase() {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  // Ana llega con su teléfono CONFIRMADO por OTP (coincide con PHONE_ANA): pasa el gate.
  // Sin fila en salon_security_settings, el gate es fail-closed ⇒ EXIGE verificación, así
  // que las ramas crear/enlazar/no-op/conflicto se ejercitan con el gate activo (realista).
  holder.currentUser = {
    id: USER_ANA,
    phone: PHONE_ANA_AUTH,
    phone_confirmed_at: "2026-01-01T00:00:00Z",
  };

  holder.store.set("salons", [{ id: SALON_A }, { id: SALON_B }]);
  holder.store.set("salon_members", [
    { user_id: "owner-a", salon_id: SALON_A, role: "owner" },
  ]);
  // Ambos salones tienen el add-on 'loyalty' activo (el alta/enlace de ficha lo
  // exige, por el bootstrap de puntos/cupón); el gate se cubre en su propio bloque.
  holder.store.set("salon_features", [
    { salon_id: SALON_A, feature: "loyalty", enabled: true },
    { salon_id: SALON_B, feature: "loyalty", enabled: true },
  ]);
  holder.store.set("customers", []);
}

/** Siembra una ficha con su phone_e164 (que en la BD real generaría la columna). */
function seedCustomer(row: Row): void {
  rowsOf("customers").push(row);
}

beforeEach(() => {
  seedBase();
});

// ─────────────────────────────────────────────────────────────────────────────
// linkOrCreateCustomerAccount — crear / enlazar / no-op / conflicto
// ─────────────────────────────────────────────────────────────────────────────
describe("linkOrCreateCustomerAccount", () => {
  it("CREA una ficha nueva enlazada cuando el teléfono no existe en el salón", async () => {
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: "612 34 56 78", // formato libre → se normaliza a +34612345678
      full_name: "Ana",
      email: "ANA@Example.com",
    });

    expect(result.outcome).toBe("created");
    expect(result.customer.user_id).toBe(USER_ANA);
    expect(result.customer.salon_id).toBe(SALON_A);
    expect(result.customer.full_name).toBe("Ana");
    expect(result.customer.email).toBe("ana@example.com"); // email normalizado a minúsculas
    // Persistió una única ficha.
    expect(rowsOf("customers")).toHaveLength(1);
  });

  it("ENLAZA una ficha existente sin cuenta (user_id NULL → user_id)", async () => {
    seedCustomer({
      id: "cust-ana",
      salon_id: SALON_A,
      full_name: "Ana",
      user_id: null,
      phone: "612345678",
      phone_e164: PHONE_ANA,
    });

    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: "+34 612 345 678",
      full_name: "Ana",
    });

    expect(result.outcome).toBe("linked");
    expect(result.customer.id).toBe("cust-ana");
    expect(result.customer.user_id).toBe(USER_ANA);
    // No se creó una segunda ficha.
    expect(rowsOf("customers")).toHaveLength(1);
  });

  it("es NO-OP idempotente si la ficha ya está enlazada a la MISMA cuenta", async () => {
    seedCustomer({
      id: "cust-ana",
      salon_id: SALON_A,
      full_name: "Ana",
      user_id: USER_ANA,
      phone_e164: PHONE_ANA,
    });

    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });

    expect(result.outcome).toBe("already_linked");
    expect(result.customer.id).toBe("cust-ana");
    expect(rowsOf("customers")).toHaveLength(1);
  });

  it("da CONFLICTO claro si el teléfono ya está vinculado a OTRA cuenta", async () => {
    seedCustomer({
      id: "cust-otra",
      salon_id: SALON_A,
      full_name: "Otra",
      user_id: USER_BEA, // ya es de otra persona
      phone_e164: PHONE_ANA,
    });

    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    // La ficha ajena no se tocó.
    expect(rowsOf("customers")[0]?.user_id).toBe(USER_BEA);
  });

  it("PROHÍBE vincular una cuenta que no es la del usuario autenticado (forbidden)", async () => {
    holder.currentUser = { id: USER_ANA };
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_BEA, // intenta enlazar la cuenta de otra persona
        phone: PHONE_ANA,
        full_name: "Bea",
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("exige sesión (unauthorized) aunque los datos sean válidos", async () => {
    holder.currentUser = null;
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("rechaza un teléfono sin número real (invalid_request)", async () => {
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: "sin tel",
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
  });

  it("da not_found si el salón no existe", async () => {
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: "salon-inexistente",
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("lanza CustomerAccountError (no un error opaco) en las ramas de fallo", async () => {
    holder.currentUser = null;
    const err = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CustomerAccountError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linkOrCreateCustomerAccount — gate del add-on 'loyalty' (sub-8)
//
// El alta/enlace de la ficha dispara el bootstrap de fidelización (cuenta de puntos
// + cupón de bienvenida), así que exige que el salón tenga contratado y activo el
// add-on 'loyalty'. Sin él ⇒ feature_not_enabled / 403, sin crear ninguna ficha.
// ─────────────────────────────────────────────────────────────────────────────
describe("linkOrCreateCustomerAccount — gate del add-on 'loyalty' (feature_not_enabled / 403)", () => {
  it("→ 403 si el salón existe pero NO tiene contratada la fidelización (y no crea ficha)", async () => {
    disableLoyalty(SALON_A);
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "feature_not_enabled", status: 403 });
    // El gate corta antes del alta: no se persistió ninguna ficha.
    expect(rowsOf("customers")).toHaveLength(0);
  });

  it("un salón INEXISTENTE gana 404 antes que el gate (assertSalonExists primero)", async () => {
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: "salon-inexistente",
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("un add-on PAUSADO (enabled=false) también cierra el gate", async () => {
    disableLoyalty(SALON_A, "disabled");
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "feature_not_enabled", status: 403 });
  });

  it("el fallo del gate es un CustomerAccountError con el mensaje de dominio exacto", async () => {
    disableLoyalty(SALON_A);
    const err = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CustomerAccountError);
    expect((err as CustomerAccountError).message).toBe(
      "Este salón no tiene contratada la fidelización",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linkOrCreateCustomerAccount — gate OTP (propiedad del teléfono, sub-3)
//
// Espejo TS del paso 3.2 de la RPC register_my_customer_account: salvo válvula
// relajada por salón (salon_security_settings.require_phone_verification=false), el
// teléfono declarado debe coincidir con el CONFIRMADO de la cuenta (auth.users.phone +
// phone_confirmed_at). Fail-closed: SIN fila de seguridad ⇒ se EXIGE verificación.
// ─────────────────────────────────────────────────────────────────────────────
describe("linkOrCreateCustomerAccount — gate OTP (phone_not_verified / 403)", () => {
  /** Relaja la válvula del salón (solo dev/staging): salta el gate OTP. */
  function relaxPhoneVerification(salonId = SALON_A): void {
    holder.store.set("salon_security_settings", [
      ...rowsOf("salon_security_settings").filter((r) => r.salon_id !== salonId),
      { salon_id: salonId, require_phone_verification: false },
    ]);
  }

  it("→ 403 phone_not_verified si la cuenta NO tiene teléfono confirmado (fail-closed sin fila)", async () => {
    holder.currentUser = { id: USER_ANA }; // sin phone / phone_confirmed_at
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "phone_not_verified", status: 403 });
    // El gate corta antes del alta: no se creó ninguna ficha.
    expect(rowsOf("customers")).toHaveLength(0);
  });

  it("→ 403 si el teléfono confirmado es OTRO distinto del declarado (anti-suplantación)", async () => {
    holder.currentUser = {
      id: USER_ANA,
      phone: "34600000000", // confirmado, pero NO es el que declara
      phone_confirmed_at: "2026-01-01T00:00:00Z",
    };
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA, // +34612345678
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "phone_not_verified", status: 403 });
    expect(rowsOf("customers")).toHaveLength(0);
  });

  it("→ 403 si hay teléfono pero SIN sello de confirmación (phone_confirmed_at ausente)", async () => {
    holder.currentUser = { id: USER_ANA, phone: PHONE_ANA_AUTH }; // sin phone_confirmed_at
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "phone_not_verified", status: 403 });
  });

  it("PASA si el teléfono declarado coincide con el CONFIRMADO (aunque cambie el formato)", async () => {
    holder.currentUser = {
      id: USER_ANA,
      phone: PHONE_ANA_AUTH, // '34612345678' (forma de cuenta, sin '+')
      phone_confirmed_at: "2026-01-01T00:00:00Z",
    };
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: "612 34 56 78", // formato libre → +34612345678 = el confirmado
      full_name: "Ana",
    });
    expect(result.outcome).toBe("created");
  });

  it("VÁLVULA RELAJADA (require_phone_verification=false): salta el gate aun sin confirmar", async () => {
    relaxPhoneVerification(SALON_A);
    holder.currentUser = { id: USER_ANA }; // sin teléfono confirmado
    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });
    expect(result.outcome).toBe("created");
  });

  it("el feature-gate gana al gate OTP (sin 'loyalty' ⇒ feature_not_enabled, no phone_not_verified)", async () => {
    disableLoyalty(SALON_A);
    holder.currentUser = { id: USER_ANA }; // tampoco verificado, pero el feature corta antes
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "feature_not_enabled", status: 403 });
  });

  it("el fallo del gate OTP es un CustomerAccountError (no un error opaco)", async () => {
    holder.currentUser = { id: USER_ANA };
    const err = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CustomerAccountError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findCustomerByPhone — lookup de duplicados del staff, acotado por salón
// ─────────────────────────────────────────────────────────────────────────────
describe("findCustomerByPhone", () => {
  const OWNER_A = "owner-a";

  beforeEach(() => {
    holder.currentUser = { id: OWNER_A }; // miembro de SALON_A
    seedCustomer({
      id: "cust-ana",
      salon_id: SALON_A,
      full_name: "Ana",
      user_id: null,
      phone_e164: PHONE_ANA,
    });
  });

  it("encuentra la ficha por teléfono NORMALIZADO (formato libre → E.164)", async () => {
    const found = await findCustomerByPhone(SALON_A, "(+34) 612-345-678");
    expect(found?.id).toBe("cust-ana");
  });

  it("devuelve null si no hay coincidencia en el salón", async () => {
    const found = await findCustomerByPhone(SALON_A, "699999999");
    expect(found).toBeNull();
  });

  it("devuelve null si el teléfono no contiene un número real", async () => {
    const found = await findCustomerByPhone(SALON_A, "----");
    expect(found).toBeNull();
  });

  it("no cruza de salón: buscar en un salón donde no soy miembro da forbidden", async () => {
    // La ficha está en SALON_A; buscamos en SALON_B (donde OWNER_A no es miembro).
    await expect(findCustomerByPhone(SALON_B, PHONE_ANA)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("exige pertenencia al salón (forbidden si no es miembro)", async () => {
    holder.currentUser = { id: "extrano" };
    await expect(findCustomerByPhone(SALON_A, PHONE_ANA)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyCustomer — solo la propia ficha, nunca la de otro
// ─────────────────────────────────────────────────────────────────────────────
describe("getMyCustomer", () => {
  beforeEach(() => {
    holder.currentUser = { id: USER_ANA };
    seedCustomer({
      id: "cust-ana-a",
      salon_id: SALON_A,
      full_name: "Ana",
      user_id: USER_ANA,
      created_at: "2026-01-01T00:00:00Z",
    });
    seedCustomer({
      id: "cust-ana-b",
      salon_id: SALON_B,
      full_name: "Ana",
      user_id: USER_ANA,
      created_at: "2026-02-01T00:00:00Z",
    });
    seedCustomer({
      id: "cust-bea",
      salon_id: SALON_A,
      full_name: "Bea",
      user_id: USER_BEA,
    });
  });

  it("devuelve TODAS las fichas de la cuenta autenticada (multi-salón)", async () => {
    const mine = await getMyCustomer();
    expect(mine.map((c) => c.id).sort()).toEqual(["cust-ana-a", "cust-ana-b"]);
    // Nunca la ficha de otra persona.
    expect(mine.some((c) => c.id === "cust-bea")).toBe(false);
  });

  it("acepta userId explícito si coincide con la sesión", async () => {
    const mine = await getMyCustomer(USER_ANA);
    expect(mine).toHaveLength(2);
  });

  it("PROHÍBE consultar la ficha de otra cuenta (forbidden)", async () => {
    await expect(getMyCustomer(USER_BEA)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("exige sesión (unauthorized)", async () => {
    holder.currentUser = null;
    await expect(getMyCustomer()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });

  it("devuelve [] si la cuenta aún no tiene ficha enlazada", async () => {
    holder.currentUser = { id: "user-sin-ficha" };
    const mine = await getMyCustomer();
    expect(mine).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyCustomerForSalon (sub-6) — la ficha del cliente autenticado en UN salón.
//
// Variante "suave" de getMyCustomer para la reserva pública: acota por salón, no
// lanza sin sesión (devuelve null) y nunca cruza de cuenta ni de salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("getMyCustomerForSalon", () => {
  beforeEach(() => {
    holder.currentUser = { id: USER_ANA };
    // Ana es cliente de A y de B (una ficha por salón, misma cuenta).
    seedCustomer({
      id: "cust-ana-a",
      salon_id: SALON_A,
      full_name: "Ana",
      phone: "612345678",
      email: "ana@correo.com",
      marketing_consent: true,
      user_id: USER_ANA,
      created_at: "2026-01-01T00:00:00Z",
    });
    seedCustomer({
      id: "cust-ana-b",
      salon_id: SALON_B,
      full_name: "Ana",
      user_id: USER_ANA,
      created_at: "2026-02-01T00:00:00Z",
    });
    // Bea comparte el salón A pero es otra cuenta: nunca debe aflorar en la de Ana.
    seedCustomer({
      id: "cust-bea",
      salon_id: SALON_A,
      full_name: "Bea",
      user_id: USER_BEA,
    });
  });

  it("devuelve la ficha del salón pedido (self, acotada por salon_id)", async () => {
    const ficha = await getMyCustomerForSalon(SALON_A);
    expect(ficha?.id).toBe("cust-ana-a");
  });

  it("elige la ficha del salón pedido, no la de otro salón de la misma cuenta", async () => {
    const ficha = await getMyCustomerForSalon(SALON_B);
    expect(ficha?.id).toBe("cust-ana-b");
  });

  it("devuelve null si la cuenta aún no es cliente de ESE salón", async () => {
    const ficha = await getMyCustomerForSalon("salon-donde-ana-no-es-cliente");
    expect(ficha).toBeNull();
  });

  it("SUAVE: sin sesión devuelve null (no lanza unauthorized)", async () => {
    holder.currentUser = null;
    await expect(getMyCustomerForSalon(SALON_A)).resolves.toBeNull();
  });

  it("nunca devuelve la ficha de OTRA cuenta aunque comparta salón", async () => {
    holder.currentUser = { id: USER_BEA }; // Bea, no Ana
    const ficha = await getMyCustomerForSalon(SALON_A);
    expect(ficha?.id).toBe("cust-bea"); // la SUYA, jamás la de Ana en el mismo salón
  });
});
