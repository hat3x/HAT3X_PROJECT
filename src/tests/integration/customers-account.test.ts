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
  currentUser: null as { id: string } | null,
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

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];

/** Reinicia la BD en memoria y siembra los dos salones (sin fichas todavía). */
function seedBase() {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.currentUser = { id: USER_ANA };

  holder.store.set("salons", [{ id: SALON_A }, { id: SALON_B }]);
  holder.store.set("salon_members", [
    { user_id: "owner-a", salon_id: SALON_A, role: "owner" },
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
