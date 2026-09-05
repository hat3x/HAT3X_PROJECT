/**
 * Aislamiento del AUTOSERVICIO del cliente (FASE 3): una persona que se registra en
 * la app de cliente solo puede VER SU PROPIA información (su ficha y su fidelización),
 * nunca la de otro cliente ni la de otro salón, y NUNCA puede ESCRIBIR sus puntos
 * (el saldo es "casi dinero": solo lo mueven el trigger de bootstrap y la operativa
 * de TPV con rol de staff).
 *
 * Cobertura en dos planos (mismo criterio que el resto de la suite):
 *
 *   1. LÓGICA DE CONFIANZA DEL SERVIDOR (comportamiento, con doble en memoria):
 *      · `getMyCustomer` (`@/lib/customers/account`) devuelve SOLO las fichas de la
 *        cuenta autenticada —en todos sus salones— y jamás la de un co-cliente del
 *        mismo salón; pedir la ficha de otra cuenta ⇒ `forbidden`.
 *      · `awardVisit` (`@/lib/loyalty/server`) es la ÚNICA vía de escritura de puntos
 *        y está cerrada con pertenencia de staff: un cliente autenticado con ficha
 *        propia pero SIN ser miembro del salón NO puede acreditarse puntos ⇒
 *        `forbidden`, y la cuenta de fidelización queda intacta.
 *
 *   2. CONTRATO RLS (a nivel de FUENTE, leyendo las migraciones): la garantía de la
 *      BD (defensa en profundidad) sigue en pie — políticas SELF acotadas por
 *      auth.uid()/app.user_customer_ids(), fidelización de SOLO LECTURA para el
 *      cliente (sin INSERT/UPDATE/DELETE self) y libro de puntos append-only. Es la
 *      pieza que garantiza que un cliente "no ve loyalty de otros" y "no escribe sus
 *      puntos" DENTRO de Postgres, donde el test de comportamiento no llega.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * Doble CON ESTADO del query builder de Supabase (mismo patrón fiel que
 * `loyalty-server.test.ts`): aplica de verdad `.eq/.gt/.is/.in/.order` y persiste
 * escrituras. NO aplica RLS (eso vive en Postgres y se cubre en el plano 2); modela
 * el FILTRO que el CÓDIGO añade —`getMyCustomer` acota por `user_id`, la pertenencia
 * por `(user_id, salon_id)`—, que es la lógica de confianza a probar. Soporta la
 * escritura completa de `awardVisit` para poder EJERCITAR el control positivo (staff
 * sí acredita), de modo que el rechazo del cliente no sea un falso positivo.
 */
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

import { getMyCustomer } from "@/lib/customers/account";
import { awardVisit, LoyaltyActionError } from "@/lib/loyalty/server";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario: dos salones, tres personas.
//   · Ana  — cliente de A y de B (misma cuenta, una ficha por salón).
//   · Bea  — co-cliente de A (misma sala que Ana): Ana no debe verla.
//   · Owner-A — staff del salón A (para el control de escritura de puntos).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "salon-a";
const SALON_B = "salon-b";
const USER_ANA = "user-ana";
const USER_BEA = "user-bea";
const OWNER_A = "owner-a";

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];
const anaAccount = (): Row =>
  rowsOf("loyalty_accounts").find((r) => r.id === "acc-ana-a") as Row;

function seed() {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.currentUser = { id: USER_ANA };

  holder.store.set("salon_members", [
    { user_id: OWNER_A, salon_id: SALON_A, role: "owner", created_at: "2026-01-01T00:00:00Z" },
    // Ana NO es staff de ningún salón: es una clienta de la app, no personal.
  ]);
  // Ambos salones tienen el add-on 'loyalty' activo: el control positivo (staff sí
  // acredita) parte de un salón CON fidelización; el rechazo del cliente es por rol.
  holder.store.set("salon_features", [
    { salon_id: SALON_A, feature: "loyalty", enabled: true },
    { salon_id: SALON_B, feature: "loyalty", enabled: true },
  ]);
  holder.store.set("customers", [
    { id: "cust-ana-a", salon_id: SALON_A, full_name: "Ana", user_id: USER_ANA, qr_token: "QR-ANA-A", created_at: "2026-01-01T00:00:00Z" },
    { id: "cust-ana-b", salon_id: SALON_B, full_name: "Ana", user_id: USER_ANA, qr_token: "QR-ANA-B", created_at: "2026-02-01T00:00:00Z" },
    { id: "cust-bea-a", salon_id: SALON_A, full_name: "Bea", user_id: USER_BEA, qr_token: "QR-BEA-A", created_at: "2026-01-15T00:00:00Z" },
  ]);
  holder.store.set("loyalty_accounts", [
    { id: "acc-ana-a", salon_id: SALON_A, customer_id: "cust-ana-a", points_balance: 0, visits_total: 0, last_visit_at: null },
  ]);
  holder.store.set("points_movements", []);
}

beforeEach(() => {
  seed();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1a. El cliente solo ve SU PROPIA ficha (ni la de un co-cliente, ni otro salón).
// ─────────────────────────────────────────────────────────────────────────────
describe("getMyCustomer — el cliente solo ve lo suyo", () => {
  it("devuelve las fichas de la cuenta en TODOS sus salones, nunca la de un co-cliente", async () => {
    holder.currentUser = { id: USER_ANA };
    const mine = await getMyCustomer();

    expect(mine.map((c) => c.id).sort()).toEqual(["cust-ana-a", "cust-ana-b"]);
    // Bea está en el MISMO salón A que Ana: aun así, Ana no la ve (aislamiento por fila).
    expect(mine.some((c) => c.id === "cust-bea-a")).toBe(false);
    expect(mine.every((c) => c.user_id === USER_ANA)).toBe(true);
  });

  it("PROHÍBE pedir la ficha de OTRA cuenta (forbidden), aunque sea del mismo salón", async () => {
    holder.currentUser = { id: USER_ANA };
    await expect(getMyCustomer(USER_BEA)).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("sin sesión ⇒ unauthorized (no consultable desde el navegador sin login)", async () => {
    holder.currentUser = null;
    await expect(getMyCustomer()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. El cliente NO puede escribir sus puntos (la única vía es de staff).
// ─────────────────────────────────────────────────────────────────────────────
describe("un cliente NO puede acreditarse puntos a sí mismo", () => {
  it("awardVisit sobre su propia ficha, siendo cliente (no staff), ⇒ forbidden y cuenta intacta", async () => {
    holder.currentUser = { id: USER_ANA }; // clienta autenticada, con ficha en A…

    await expect(
      awardVisit({
        salon_id: SALON_A, // …pero NO es miembro del salón A
        customer_id: "cust-ana-a",
        line_items: [{ price_cents: 2000 }],
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    // El saldo no se fabricó desde el navegador: la cuenta sigue a cero.
    expect(anaAccount().points_balance).toBe(0);
    expect(anaAccount().visits_total).toBe(0);
    expect(rowsOf("points_movements")).toHaveLength(0);
  });

  it("el fallo es un LoyaltyActionError de dominio (no un error opaco)", async () => {
    holder.currentUser = { id: USER_ANA };
    const err = await awardVisit({
      salon_id: SALON_A,
      customer_id: "cust-ana-a",
      line_items: [{ price_cents: 2000 }],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoyaltyActionError);
  });

  it("control positivo: el STAFF del salón sí acredita (la barrera es el rol, no la sesión)", async () => {
    holder.currentUser = { id: OWNER_A }; // miembro del salón A
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: "cust-ana-a",
      line_items: [{ price_cents: 2000 }], // 20 € → 10 puntos
    });
    expect(result.points_earned).toBe(10);
    expect(anaAccount().points_balance).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Contrato RLS a nivel de FUENTE: la garantía de la BD sigue en pie.
// ─────────────────────────────────────────────────────────────────────────────
describe("contrato RLS SELF en las migraciones (defensa en profundidad)", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const selfSql = readFileSync(join(migrationsDir, "20260717120000_rls_self_customer.sql"), "utf8");
  const guardSql = readFileSync(join(migrationsDir, "20260717130000_rls_self_guard.sql"), "utf8");

  // Sentencias `create policy … ;` de TODAS las migraciones del repo. Escanear un
  // único archivo no basta: una política de escritura del cliente introducida en
  // CUALQUIER migración futura debe ser detectable aquí (no solo en la parte C).
  const allPolicyStmts = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").match(/create policy[\s\S]*?;/gi) ?? []);

  const loyaltyTables = [
    "loyalty_accounts",
    "points_movements",
    "welcome_coupons",
    "rewards",
  ] as const;

  it("customers: política SELF de SELECT y de UPDATE acotadas por auth.uid()", () => {
    expect(selfSql).toMatch(
      /create policy "self_select_own_customer"\s*on public\.customers for select to authenticated\s*using \(user_id = \(select auth\.uid\(\)\)\)/,
    );
    expect(selfSql).toMatch(
      /create policy "self_update_own_customer"\s*on public\.customers for update to authenticated\s*using\s+\(user_id = \(select auth\.uid\(\)\)\)\s*with check \(user_id = \(select auth\.uid\(\)\)\)/,
    );
  });

  it.each(loyaltyTables)(
    "%s: existe la política SELF de SELECT acotada por app.user_customer_ids",
    (table) => {
      const selectPolicy = new RegExp(
        `create policy "self_select_own_[a-z_]+"\\s*on public\\.${table} for select to authenticated\\s*using \\(customer_id in \\(select app\\.user_customer_ids\\(\\)\\)\\)`,
      );
      expect(selfSql).toMatch(selectPolicy);
    },
  );

  it("NINGUNA migración concede al cliente escritura de fidelización (self write)", () => {
    // Una política de autoservicio SIEMPRE se acota con app.user_customer_ids(); si
    // además NO es `for select`, es una escritura del cliente sobre "casi dinero" —
    // prohibida. Se busca en TODAS las migraciones (no solo en la parte C) para que
    // una regresión introducida en una migración FUTURA no pase desapercibida —el
    // agujero que el guardián de la BD cierra en deploy, cerrado también en CI—.
    const customerScopedPolicies = allPolicyStmts.filter((p) => /user_customer_ids/i.test(p));
    // No vacío: el escaneo del corpus SÍ ve las políticas de autoservicio (las 4 de
    // fidelización). Si el glob se rompiera, esto lo delataría en vez de pasar en falso.
    expect(customerScopedPolicies.length).toBeGreaterThanOrEqual(4);
    // Y TODAS ellas son de solo lectura: ninguna escritura del cliente.
    const selfWritePolicies = customerScopedPolicies.filter((p) => !/for\s+select/i.test(p));
    expect(selfWritePolicies).toEqual([]);
  });

  it("el libro de puntos es append-only: el guardián veta el UPDATE de points_movements", () => {
    // No basta con que aparezca 'append-only': se ancla al PREDICADO real que detecta
    // la regresión —una política de UPDATE/ALL sobre points_movements—, de modo que
    // cambiarlo (p. ej. a DELETE) rompería este test, no solo el guardián en deploy.
    expect(guardSql).toMatch(/tablename = 'points_movements'[\s\S]*?cmd in \('UPDATE', 'ALL'\)/);
    expect(guardSql).toContain("points_movements tiene política(s) de UPDATE");
  });

  it("las políticas SELF se conceden a 'authenticated', nunca a anon/public", () => {
    // Todas las políticas self_ son `to authenticated`; el guardián además aborta si
    // cualquier política de estas tablas quedara expuesta a anon/public.
    const selfPolicies = selfSql.match(/create policy "self_[^"]+"[\s\S]*?;/g) ?? [];
    expect(selfPolicies.length).toBeGreaterThanOrEqual(6); // customers×2 + 4 loyalty
    for (const policy of selfPolicies) {
      expect(policy).toContain("to authenticated");
      expect(policy).not.toMatch(/to (anon|public)/);
    }
  });
});
