/**
 * Gate del add-on 'loyalty' — CONTRATO TRANSVERSAL de las tres superficies (sub-11,
 * requisito 2).
 *
 * Las tres puertas de entrada del núcleo nativo de fidelización comparten UN MISMO
 * gate de entitlement: si el salón no tiene contratado y activo el add-on 'loyalty'
 * (fila ausente en `public.salon_features` o `enabled = false`), la operación falla
 * con `feature_not_enabled` / 403 SIN tocar dato alguno; con el add-on activo,
 * funciona con normalidad. Este archivo lo verifica para las tres a la vez, contra
 * UN ÚNICO escenario, de modo que un fallo señala "el gate de productización
 * regresó" como propiedad transversal:
 *
 *   · lookupByQr                 (`@/lib/loyalty/server`)   — lectura del staff.
 *   · awardVisit                 (`@/lib/loyalty/server`)   — escritura del staff.
 *   · linkOrCreateCustomerAccount(`@/lib/customers/account`) — autoservicio cliente.
 *
 * Las ramas por-módulo (todos los códigos de error, idempotencia, hitos, conflicto
 * de teléfono, etc.) viven en `loyalty-server.test.ts` y `customers-account.test.ts`;
 * aquí se prueba SOLO la propiedad compartida (mismo código, mismo 403, cero
 * escrituras) + un control positivo por superficie, con el mismo doble CON ESTADO
 * (BD en memoria que aplica filtros y persiste escrituras) del resto de la suite.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  store: new Map<string, Row[]>(),
  currentUser: null as { id: string } | null,
  idCounter: 0,
}));

/** Comparador total para `.gt` y `.order` (números como números; resto, texto). */
function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const [as, bs] = [String(a), String(b)];
  return as < bs ? -1 : as > bs ? 1 : 0;
}

interface Pending {
  op: "insert" | "update" | "upsert" | "delete";
  payload: Row | Row[] | null;
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

/** Builder fiel del query builder de Supabase sobre la BD en memoria (patrón de la suite). */
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
      list = [...list].sort((a, b) => (orderAsc ? cmp(a[col], b[col]) : -cmp(a[col], b[col])));
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
    if (pending.op === "upsert") {
      const cols = (pending.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      return payloads.map((p) => {
        const existing = rows().find((r) => cols.every((c) => r[c] === p[c]));
        if (existing !== undefined) {
          if (pending?.ignoreDuplicates !== true) Object.assign(existing, p);
          return existing;
        }
        const row: Row = { id: p.id ?? `${table}-${++holder.idCounter}`, ...p };
        rows().push(row);
        return row;
      });
    }
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
    gt: (col: string, val: unknown) => {
      filters.push((r) => r[col] != null && cmp(r[col], val) > 0);
      return b;
    },
    is: (col: string, _val: null) => {
      filters.push((r) => r[col] === null || r[col] === undefined);
      return b;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
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
    upsert: (payload: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      pending = {
        op: "upsert",
        payload,
        onConflict: options?.onConflict,
        ignoreDuplicates: options?.ignoreDuplicates,
      };
      return b;
    },
    delete: () => {
      pending = { op: "delete", payload: null };
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

import { linkOrCreateCustomerAccount } from "@/lib/customers/account";
import { awardVisit, lookupByQr } from "@/lib/loyalty/server";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario: un salón A con staff (owner) y un cliente con ficha + QR + cuenta.
// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "salon-a";
const OWNER_A = "owner-a"; // staff del salón A (para lookupByQr / awardVisit)
const CLIENT_USER = "client-user"; // cuenta de la app de cliente (para linkOrCreate)
const CUSTOMER_A = "customer-a";
const QR_A = "QR-CLIENTE-A";
const NEW_PHONE = "+34655111222"; // teléfono del alta de autoservicio (E.164)

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];
const accountA = (): Row => rowsOf("loyalty_accounts").find((r) => r.id === "acc-a") as Row;

function seed() {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.currentUser = { id: OWNER_A };

  holder.store.set("salons", [{ id: SALON_A }]);
  holder.store.set("salon_members", [
    { user_id: OWNER_A, salon_id: SALON_A, role: "owner", created_at: "2026-01-01T00:00:00Z" },
  ]);
  // Add-on 'loyalty' contratado y activo por defecto: los controles positivos parten
  // de un salón CON fidelización. `disableLoyalty` lo retira en los tests de gate.
  holder.store.set("salon_features", [{ salon_id: SALON_A, feature: "loyalty", enabled: true }]);
  holder.store.set("customers", [
    { id: CUSTOMER_A, salon_id: SALON_A, full_name: "Ana", qr_token: QR_A, user_id: null },
  ]);
  holder.store.set("loyalty_accounts", [
    { id: "acc-a", salon_id: SALON_A, customer_id: CUSTOMER_A, points_balance: 0, visits_total: 0, last_visit_at: null },
  ]);
  holder.store.set("points_movements", []);
}

/** Retira la fidelización del salón, en las dos formas que el gate trata igual. */
function disableLoyalty(mode: "absent" | "disabled" = "absent"): void {
  const rows = rowsOf("salon_features");
  if (mode === "absent") {
    holder.store.set("salon_features", rows.filter((r) => r.salon_id !== SALON_A));
  } else {
    for (const r of rows) if (r.salon_id === SALON_A) r.enabled = false;
  }
}

/** Prepara el actor de cada superficie: staff para las de loyalty, cliente para el alta. */
const asStaff = () => (holder.currentUser = { id: OWNER_A });
const asClient = () => (holder.currentUser = { id: CLIENT_USER });

const linkInput = () => ({
  salon_id: SALON_A,
  user_id: CLIENT_USER,
  phone: NEW_PHONE,
  full_name: "Nuevo Cliente",
});

beforeEach(() => {
  seed();
});

// ─────────────────────────────────────────────────────────────────────────────
// SIN el add-on: las TRES superficies fallan igual (feature_not_enabled / 403) y
// ninguna toca la BD. Se prueban ambas formas del gate cerrado (ausente y pausado).
// ─────────────────────────────────────────────────────────────────────────────
describe("gate cerrado — sin 'loyalty' las tres superficies dan feature_not_enabled / 403", () => {
  for (const mode of ["absent", "disabled"] as const) {
    it(`lookupByQr ⇒ 403 (add-on ${mode})`, async () => {
      asStaff();
      disableLoyalty(mode);
      await expect(lookupByQr(QR_A)).rejects.toMatchObject({
        code: "feature_not_enabled",
        status: 403,
      });
    });

    it(`awardVisit ⇒ 403 y NO escribe puntos ni libro mayor (add-on ${mode})`, async () => {
      asStaff();
      disableLoyalty(mode);
      await expect(
        awardVisit({ salon_id: SALON_A, customer_id: CUSTOMER_A, line_items: [{ price_cents: 2000 }] }),
      ).rejects.toMatchObject({ code: "feature_not_enabled", status: 403 });
      // El gate corta antes de cualquier escritura.
      expect(accountA().points_balance).toBe(0);
      expect(accountA().visits_total).toBe(0);
      expect(rowsOf("points_movements")).toHaveLength(0);
    });

    it(`linkOrCreateCustomerAccount ⇒ 403 y NO crea ficha (add-on ${mode})`, async () => {
      asClient();
      disableLoyalty(mode);
      const before = rowsOf("customers").length;
      await expect(linkOrCreateCustomerAccount(linkInput())).rejects.toMatchObject({
        code: "feature_not_enabled",
        status: 403,
      });
      // No se persistió ninguna ficha nueva (el alta dispara el bootstrap de loyalty).
      expect(rowsOf("customers")).toHaveLength(before);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CON el add-on: control positivo por superficie (el gate deja pasar y opera).
// ─────────────────────────────────────────────────────────────────────────────
describe("gate abierto — con 'loyalty' activo las tres superficies operan con normalidad", () => {
  it("lookupByQr devuelve el estado del cliente", async () => {
    asStaff();
    const state = await lookupByQr(QR_A);
    expect(state.customer.id).toBe(CUSTOMER_A);
  });

  it("awardVisit acredita puntos y persiste el libro mayor", async () => {
    asStaff();
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }], // 20 € → 10 puntos
    });
    expect(result.points_earned).toBe(10);
    expect(accountA().points_balance).toBe(10);
    expect(rowsOf("points_movements")).toHaveLength(1);
  });

  it("linkOrCreateCustomerAccount crea la ficha del cliente", async () => {
    asClient();
    const result = await linkOrCreateCustomerAccount(linkInput());
    expect(result.outcome).toBe("created");
    expect(result.customer.user_id).toBe(CLIENT_USER);
    // La ficha nueva se persistió (junto a la sembrada, que era de otra persona).
    expect(rowsOf("customers").some((c) => c.user_id === CLIENT_USER)).toBe(true);
  });
});
