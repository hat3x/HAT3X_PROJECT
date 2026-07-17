/**
 * Tests de integración del núcleo NATIVO de fidelización (`@/lib/loyalty/server`).
 *
 * A diferencia de los unitarios de `points.ts` (lógica pura), aquí se ejercita la
 * orquestación de servidor completa de `awardVisit` / `lookupByQr` sustituyendo
 * Supabase por un DOBLE CON ESTADO (una BD en memoria que aplica de verdad los
 * filtros `.eq/.gt/.is` y persiste las escrituras). Así las aserciones no son
 * "el mock devolvió lo que le dije" sino "el código escribió/leyó lo correcto".
 *
 * Cubre las cuatro propiedades de la subtarea sub-5:
 *   1. Cálculo de puntos por línea con la MISMA regla que denueveanueve
 *      (`ceil(price_cents / 200)`), verificada de extremo a extremo en `awardVisit`.
 *   2. Transición del cupón de bienvenida ACTIVE → USED al canjearlo.
 *   3. Creación de recompensa de hito EXACTAMENTE a las 3 / 5 / 8 / 10 visitas.
 *   4. Aislamiento multi-tenant: la fidelización de un salón no es visible ni
 *      mutable desde otro salón (el código acota SIEMPRE por `salon_id`).
 *
 * Nota sobre RLS: la política RLS real de Postgres se valida en la capa de BD
 * (migración). Estos tests cubren la "lógica de confianza del servidor": que la
 * aplicación filtra por `salon_id` en cada consulta, de modo que una petición
 * cruzada entre salones no encuentra ni toca datos ajenos.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Contenedor mutable izado por encima de los imports: BD en memoria compartida
// por el cliente RLS (createClient) y el cliente admin (createAdminClient), más
// el usuario autenticado de turno.
// ─────────────────────────────────────────────────────────────────────────────
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
 * Builder mínimo pero fiel del query builder de Supabase sobre la BD en memoria.
 * Acumula filtros y, en el terminal (`then`/`maybeSingle`/`single`), los aplica.
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
    // delete
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

  const resolveSingle = (): { data: Row | null; error: unknown } => {
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

import {
  awardVisit,
  lookupByQr,
  LoyaltyActionError,
} from "@/lib/loyalty/server";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de escenario (dos salones, dos usuarios, dos clientes).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "salon-a";
const SALON_B = "salon-b";
const USER_A = "user-a"; // owner de A
const USER_B = "user-b"; // owner de B
const CUSTOMER_A = "customer-a";
const QR_A = "QR-CLIENTE-A";
const CUSTOMER_B = "customer-b";
const QR_B = "QR-CLIENTE-B";
const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

/** Reinicia la BD en memoria y siembra el escenario base (salón A, usuario A). */
function seedBase(opts?: { visitsTotal?: number; pointsBalance?: number }) {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.currentUser = { id: USER_A };

  holder.store.set("salon_members", [
    { user_id: USER_A, salon_id: SALON_A, role: "owner", created_at: "2026-01-01T00:00:00Z" },
    { user_id: USER_B, salon_id: SALON_B, role: "owner", created_at: "2026-01-01T00:00:00Z" },
  ]);
  holder.store.set("customers", [
    { id: CUSTOMER_A, salon_id: SALON_A, full_name: "Ana (A)", qr_token: QR_A },
    { id: CUSTOMER_B, salon_id: SALON_B, full_name: "Beto (B)", qr_token: QR_B },
  ]);
  holder.store.set("loyalty_accounts", [
    {
      id: "acc-a",
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      points_balance: opts?.pointsBalance ?? 0,
      visits_total: opts?.visitsTotal ?? 0,
      last_visit_at: null,
    },
  ]);
}

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];
const accountA = (): Row => rowsOf("loyalty_accounts").find((r) => r.id === "acc-a") as Row;

beforeEach(() => {
  seedBase();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cálculo de puntos por línea — regla de denueveanueve, extremo a extremo.
// ─────────────────────────────────────────────────────────────────────────────
describe("awardVisit — puntos por línea (regla ceil(price_cents / 200))", () => {
  it("acredita ceil(price_cents/200) por línea y suma al saldo", async () => {
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [
        { price_cents: 4500, label: "Corte" }, // 45 € → 22,5 → 23
        { price_cents: 2000 }, //                20 € → 10
      ],
    });

    expect(result.points_earned).toBe(33); // 23 + 10, idéntico a denueveanueve
    expect(result.points_balance).toBe(33);
    expect(result.already_awarded).toBe(false);
    // Persistido en la cuenta y en el libro mayor.
    expect(accountA().points_balance).toBe(33);
    expect(accountA().visits_total).toBe(1);
    const movements = rowsOf("points_movements");
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "EARN", points: 33, salon_id: SALON_A });
  });

  it("suma sobre el saldo previo (no lo pisa)", async () => {
    seedBase({ pointsBalance: 100, visitsTotal: 1 });
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }], // +10
    });
    expect(result.points_earned).toBe(10);
    expect(result.points_balance).toBe(110);
    expect(accountA().points_balance).toBe(110);
  });

  it("respeta el override manual de puntos por línea", async () => {
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 9999, points: 5 }],
    });
    expect(result.points_earned).toBe(5);
  });

  it("NO usa la fórmula sin corregir (/2): 20 € da 10 puntos, no 1000", async () => {
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
    });
    expect(result.points_earned).toBe(10);
    expect(result.points_earned).not.toBe(1000);
  });

  it("rechaza una visita sin líneas (§1.2, no se otorgan puntos a ciegas)", async () => {
    await expect(
      awardVisit({ salon_id: SALON_A, customer_id: CUSTOMER_A, line_items: [] }),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(rowsOf("points_movements")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cupón de bienvenida — transición ACTIVE → USED al canjear.
// ─────────────────────────────────────────────────────────────────────────────
describe("awardVisit — cupón de bienvenida ACTIVE → USED", () => {
  function seedCoupon(status: "ACTIVE" | "USED", expiresAt = FUTURE) {
    holder.store.set("welcome_coupons", [
      {
        id: "coupon-a",
        salon_id: SALON_A,
        customer_id: CUSTOMER_A,
        percent_off: 10,
        status,
        expires_at: expiresAt,
        used_at: null,
      },
    ]);
  }

  it("canjea el cupón ACTIVE (→ USED, used_at fijado) y aplica el descuento", async () => {
    seedCoupon("ACTIVE");
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }], // total 20 € → 10 % = 200
      redeem_coupon: true,
    });

    expect(result.redeemed_coupon).toMatchObject({ id: "coupon-a", percent_off: 10 });
    expect(result.discount_cents).toBe(200);
    // La FILA del cupón transiciona a USED con marca de tiempo.
    const coupon = rowsOf("welcome_coupons")[0]!;
    expect(coupon.status).toBe("USED");
    expect(coupon.used_at).not.toBeNull();
  });

  it("NO toca el cupón si no se pide el canje (queda ACTIVE)", async () => {
    seedCoupon("ACTIVE");
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
      redeem_coupon: false,
    });

    expect(result.redeemed_coupon).toBeNull();
    expect(result.discount_cents).toBe(0);
    expect(rowsOf("welcome_coupons")[0]!.status).toBe("ACTIVE");
  });

  it("un cupón ya USED no se vuelve a canjear (sin descuento, idempotencia de estado)", async () => {
    seedCoupon("USED");
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
      redeem_coupon: true,
    });

    expect(result.redeemed_coupon).toBeNull();
    expect(result.discount_cents).toBe(0);
  });

  it("un cupón caducado no se canjea (gt expires_at)", async () => {
    seedCoupon("ACTIVE", PAST);
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
      redeem_coupon: true,
    });

    expect(result.redeemed_coupon).toBeNull();
    expect(rowsOf("welcome_coupons")[0]!.status).toBe("ACTIVE"); // intacto
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recompensas de hito — EXACTAMENTE a las 3 / 5 / 8 / 10 visitas.
// ─────────────────────────────────────────────────────────────────────────────
describe("awardVisit — recompensa de hito 3/5/8/10", () => {
  const cases: Array<[number, string]> = [
    [3, "SCALP_DIAGNOSIS"],
    [5, "EXPRESS_TREATMENT"],
    [8, "RETAIL_VOUCHER"],
    [10, "PACK_UPGRADE"],
  ];

  for (const [visits, rewardType] of cases) {
    it(`crea la recompensa ${rewardType} al alcanzar la visita nº ${visits}`, async () => {
      seedBase({ visitsTotal: visits - 1 });
      const result = await awardVisit({
        salon_id: SALON_A,
        customer_id: CUSTOMER_A,
        line_items: [{ price_cents: 2000 }],
      });

      expect(result.visits_total).toBe(visits);
      expect(result.reward).not.toBeNull();
      expect(result.reward?.type).toBe(rewardType);
      // Código RW-<3 primeras>-<sufijo> y persistido AVAILABLE.
      expect(result.reward?.code).toMatch(
        new RegExp(`^RW-${rewardType.slice(0, 3)}-[A-Z0-9]{6}$`),
      );
      const rewards = rowsOf("rewards");
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toMatchObject({
        type: rewardType,
        status: "AVAILABLE",
        salon_id: SALON_A,
        customer_id: CUSTOMER_A,
      });
    });
  }

  it("NO crea recompensa en una visita que no es hito (p. ej. la nº 4)", async () => {
    seedBase({ visitsTotal: 3 }); // → visita nº 4
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
    });

    expect(result.visits_total).toBe(4);
    expect(result.reward).toBeNull();
    expect(rowsOf("rewards")).toHaveLength(0);
  });

  it("no hay hitos a partir de la visita nº 11", async () => {
    seedBase({ visitsTotal: 10 }); // → visita nº 11
    const result = await awardVisit({
      salon_id: SALON_A,
      customer_id: CUSTOMER_A,
      line_items: [{ price_cents: 2000 }],
    });

    expect(result.visits_total).toBe(11);
    expect(result.reward).toBeNull();
    expect(rowsOf("rewards")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Aislamiento multi-tenant — no visible ni mutable desde otro salón.
// ─────────────────────────────────────────────────────────────────────────────
describe("aislamiento multi-tenant — la fidelización no cruza entre salones", () => {
  it("lookupByQr: un miembro del salón B no ve al cliente del salón A (404)", async () => {
    holder.currentUser = { id: USER_B }; // salón activo = B

    await expect(lookupByQr(QR_A)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("lookupByQr: el mismo QR SÍ es visible desde su propio salón (control positivo)", async () => {
    holder.currentUser = { id: USER_A }; // salón activo = A

    const state = await lookupByQr(QR_A);
    expect(state.customer.id).toBe(CUSTOMER_A);
    expect(state.points_balance).toBe(0);
  });

  it("awardVisit: un miembro de B no puede acreditar al cliente de A (404) y NO muta su cuenta", async () => {
    holder.currentUser = { id: USER_B }; // B es su salón; pasa la pertenencia a B…

    await expect(
      awardVisit({
        salon_id: SALON_B, // …pero el cliente A no está en B
        customer_id: CUSTOMER_A,
        line_items: [{ price_cents: 2000 }],
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    // La cuenta del cliente A queda INTACTA (nada escrito de forma cruzada).
    expect(accountA().points_balance).toBe(0);
    expect(accountA().visits_total).toBe(0);
    expect(rowsOf("points_movements")).toHaveLength(0);
  });

  it("awardVisit: un miembro de A no puede operar sobre el salón B (403 forbidden)", async () => {
    holder.currentUser = { id: USER_A }; // no es miembro de B

    await expect(
      awardVisit({
        salon_id: SALON_B,
        customer_id: CUSTOMER_B,
        line_items: [{ price_cents: 2000 }],
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("awardVisit sin sesión → 401 unauthorized (no fabricable desde el navegador)", async () => {
    holder.currentUser = null;

    await expect(
      awardVisit({
        salon_id: SALON_A,
        customer_id: CUSTOMER_A,
        line_items: [{ price_cents: 2000 }],
      }),
    ).rejects.toBeInstanceOf(LoyaltyActionError);
  });
});
