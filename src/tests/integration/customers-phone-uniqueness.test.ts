/**
 * Unicidad por teléfono canónico — "un teléfono = una ficha por salón".
 *
 * En la BD, el índice ÚNICO PARCIAL `idx_customers_salon_phone_e164 (salon_id,
 * phone_e164) where phone_e164 is not null` (migración 20260717110000) prohíbe DOS
 * fichas con el mismo teléfono canónico DENTRO de un salón, pero PERMITE la misma
 * persona (mismo teléfono) en salones distintos —Salón OS es multi-tenant—. Aquí no
 * hay Postgres, así que el doble de Supabase MODELA ese índice de verdad (calcula
 * `phone_e164 = normalizePhone(phone)` en cada insert —como la columna generada— y
 * rechaza con el código `23505` la colisión dentro del mismo salón).
 *
 * Sobre ese doble fiel se ejercita el CÓDIGO DE PRODUCCIÓN `linkOrCreateCustomerAccount`
 * (`@/lib/customers/account`) para comprobar que:
 *   · mismo teléfono en el MISMO salón, otra cuenta ⇒ CONFLICTO (no duplica),
 *   · mismo teléfono en salones DISTINTOS ⇒ dos fichas (una por salón),
 *   · mismo teléfono, misma cuenta, dos veces ⇒ idempotente (no duplica),
 *   · el índice es el ÚLTIMO backstop: si una carrera esquiva el pre-chequeo, el
 *     `23505` se re-resuelve enlazando la ficha existente (nunca una segunda).
 * Y un bloque que valida que el propio doble modela el índice (misma-sala falla,
 * cross-sala permite, parcial deja coexistir las fichas sin teléfono).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { normalizePhone } from "@/lib/customers/normalize-phone";

type Row = Record<string, unknown>;

const holder = vi.hoisted(() => ({
  store: new Map<string, Row[]>(),
  currentUser: null as { id: string } | null,
  idCounter: 0,
  /**
   * Teléfonos canónicos que el PRÓXIMO read por `phone_e164` debe fingir NO ver
   * (una sola vez). Simula la ventana de carrera: el pre-chequeo por teléfono no
   * encuentra la ficha que otra petición insertó microsegundos antes, así que el
   * código intenta insertar y choca con el índice único (`23505`).
   */
  hidePhoneOnce: new Set<string>(),
}));

interface Pending {
  op: "insert" | "update" | "delete";
  payload: Row | Row[] | null;
}

/** Resultado interno de una escritura: filas afectadas o error de restricción. */
interface WriteResult {
  rows: Row[];
  error: { code: string; message: string } | null;
}

/**
 * Builder del query builder de Supabase sobre la BD en memoria que, además, APLICA
 * las restricciones únicas parciales de `customers` en el `insert` (como haría el
 * motor): `(salon_id, phone_e164)` y `(salon_id, user_id)`, ambas where col not null.
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

  /** ¿La fila candidata viola una única parcial ya presente en la tabla? */
  function uniqueViolation(candidate: Row): boolean {
    if (table !== "customers") return false;
    const sameSalon = (r: Row): boolean => r.salon_id === candidate.salon_id && r !== candidate;
    if (
      candidate.phone_e164 != null &&
      rows().some((r) => sameSalon(r) && r.phone_e164 === candidate.phone_e164)
    ) {
      return true;
    }
    if (
      candidate.user_id != null &&
      rows().some((r) => sameSalon(r) && r.user_id === candidate.user_id)
    ) {
      return true;
    }
    return false;
  }

  function runWrite(): WriteResult {
    if (pending === null) return { rows: apply(rows()), error: null };
    const payloads: Row[] = Array.isArray(pending.payload)
      ? pending.payload
      : pending.payload === null
        ? []
        : [pending.payload];

    if (pending.op === "insert") {
      const inserted: Row[] = [];
      for (const p of payloads) {
        const row = withGeneratedColumns(p);
        if (uniqueViolation(row)) {
          // El índice único parcial rechaza el duplicado: nada se persiste.
          return {
            rows: [],
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        rows().push(row);
        inserted.push(row);
      }
      return { rows: inserted, error: null };
    }
    if (pending.op === "update") {
      const targets = apply(rows());
      for (const r of targets) Object.assign(r, pending.payload as Row);
      return { rows: targets, error: null };
    }
    const removed = apply(rows());
    holder.store.set(
      table,
      rows().filter((r) => !filters.every((f) => f(r))),
    );
    return { rows: removed, error: null };
  }

  function runRead(): WriteResult {
    // Ventana de carrera: ocultar UNA vez el read por (salon_id, phone_e164) marcado.
    // Se exige que la consulta acote AMBOS —como hace el pre-chequeo real
    // findCustomerByPhoneE164—, para no suprimir por accidente el lookup de OTRO
    // salón con el mismo teléfono.
    const raceKey = `${String(eqMap.salon_id)}::${String(eqMap.phone_e164)}`;
    if (
      table === "customers" &&
      typeof eqMap.phone_e164 === "string" &&
      typeof eqMap.salon_id === "string" &&
      holder.hidePhoneOnce.has(raceKey)
    ) {
      holder.hidePhoneOnce.delete(raceKey);
      return { rows: [], error: null };
    }
    return { rows: apply(rows()), error: null };
  }

  const resolveList = (): { data: Row[]; error: WriteResult["error"] } => {
    const { rows: data, error } = pending !== null ? runWrite() : runRead();
    return { data, error };
  };

  const resolveSingle = (): { data: Row | null; error: WriteResult["error"] } => {
    const { data, error } = resolveList();
    return { data: data[0] ?? null, error };
  };

  const b = {
    // `_cols` opcional: los tests invocan el builder directamente con `.select("*")`.
    select: (_cols?: string) => b,
    eq: (col: string, val: unknown) => {
      eqMap[col] = val;
      filters.push((r) => r[col] === val);
      return b;
    },
    is: (col: string, _val: null) => {
      filters.push((r) => r[col] === null || r[col] === undefined);
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
    then: (onFulfilled: (v: { data: Row[]; error: WriteResult["error"] }) => unknown) =>
      onFulfilled(resolveList()),
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

// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "salon-a";
const SALON_B = "salon-b";
const USER_ANA = "user-ana";
const USER_BEA = "user-bea";
const PHONE_ANA = "+34612345678"; // forma canónica del número de Ana

const rowsOf = (table: string): Row[] => holder.store.get(table) ?? [];
const customers = (): Row[] => rowsOf("customers");

function seedBase() {
  holder.store = new Map<string, Row[]>();
  holder.idCounter = 0;
  holder.currentUser = { id: USER_ANA };
  holder.hidePhoneOnce = new Set<string>();
  holder.store.set("salons", [{ id: SALON_A }, { id: SALON_B }]);
  // Add-on 'loyalty' activo en ambos salones: el alta/enlace de ficha lo exige.
  holder.store.set("salon_features", [
    { salon_id: SALON_A, feature: "loyalty", enabled: true },
    { salon_id: SALON_B, feature: "loyalty", enabled: true },
  ]);
  // Estas pruebas cubren el ÍNDICE ÚNICO por teléfono, NO el gate OTP: se relaja la
  // válvula de verificación por salón (require_phone_verification=false) para aislar esa
  // preocupación. El enforcement OTP tiene su propio bloque en customers-account.test.
  holder.store.set("salon_security_settings", [
    { salon_id: SALON_A, require_phone_verification: false },
    { salon_id: SALON_B, require_phone_verification: false },
  ]);
  holder.store.set("customers", []);
}

beforeEach(() => {
  seedBase();
});

// ─────────────────────────────────────────────────────────────────────────────
// El doble modela FIELMENTE el índice único parcial (base de todo lo demás).
// ─────────────────────────────────────────────────────────────────────────────
describe("el índice único parcial (salon_id, phone_e164) queda bien modelado", () => {
  it("rechaza (23505) una segunda ficha con el MISMO teléfono en el MISMO salón", async () => {
    const admin = makeClient();
    const first = await admin
      .from("customers")
      .insert({ salon_id: SALON_A, full_name: "Ana", phone: "612345678" })
      .select("*")
      .single();
    expect(first.error).toBeNull();

    // Otro formato del MISMO número → mismo phone_e164 → colisión en el salón A.
    const second = await admin
      .from("customers")
      .insert({ salon_id: SALON_A, full_name: "Ana (dup)", phone: "+34 612 345 678" })
      .select("*")
      .single();

    expect(second.error).toMatchObject({ code: "23505" });
    expect(customers()).toHaveLength(1); // el duplicado NO se persistió
  });

  it("PERMITE el mismo teléfono en salones DISTINTOS (único acotado por salón)", async () => {
    const admin = makeClient();
    await admin
      .from("customers")
      .insert({ salon_id: SALON_A, full_name: "Ana", phone: "612345678" })
      .select("*")
      .single();
    const other = await admin
      .from("customers")
      .insert({ salon_id: SALON_B, full_name: "Ana", phone: "612345678" })
      .select("*")
      .single();

    expect(other.error).toBeNull();
    expect(customers()).toHaveLength(2); // una ficha por salón, coexisten
  });

  it("es PARCIAL: dos fichas SIN teléfono real (phone_e164 null) coexisten en un salón", async () => {
    const admin = makeClient();
    // 'sin tel' normaliza a null → fuera del único parcial → sin colisión.
    await admin
      .from("customers")
      .insert({ salon_id: SALON_A, full_name: "X", phone: "sin tel" })
      .select("*")
      .single();
    const second = await admin
      .from("customers")
      .insert({ salon_id: SALON_A, full_name: "Y", phone: "----" })
      .select("*")
      .single();

    expect(second.error).toBeNull();
    expect(customers()).toHaveLength(2);
    expect(customers().every((c) => c.phone_e164 === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// linkOrCreateCustomerAccount respeta la unicidad de extremo a extremo.
// ─────────────────────────────────────────────────────────────────────────────
describe("linkOrCreateCustomerAccount — unicidad por salón, de extremo a extremo", () => {
  it("mismo teléfono, MISMO salón, OTRA cuenta ⇒ conflicto (una sola ficha)", async () => {
    // Ana crea su ficha en el salón A.
    holder.currentUser = { id: USER_ANA };
    const created = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: "612 34 56 78",
      full_name: "Ana",
    });
    expect(created.outcome).toBe("created");
    expect(customers()).toHaveLength(1);

    // Bea intenta el MISMO número en el MISMO salón: la app lo detecta por teléfono
    // (no llega a insertar) y da conflicto — el teléfono es de otra persona.
    holder.currentUser = { id: USER_BEA };
    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_BEA,
        phone: "+34 612 345 678",
        full_name: "Bea",
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });

    expect(customers()).toHaveLength(1); // nunca una segunda ficha
    expect(customers()[0]?.user_id).toBe(USER_ANA); // la de Ana, intacta
  });

  it("mismo teléfono, salones DISTINTOS, misma cuenta ⇒ una ficha por salón", async () => {
    holder.currentUser = { id: USER_ANA };
    const inA = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });
    const inB = await linkOrCreateCustomerAccount({
      salon_id: SALON_B,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });

    expect(inA.outcome).toBe("created");
    expect(inB.outcome).toBe("created");
    expect(customers()).toHaveLength(2);
    expect(customers().map((c) => c.salon_id).sort()).toEqual([SALON_A, SALON_B]);
    // La misma persona (mismo user_id) con una ficha en cada salón.
    expect(customers().every((c) => c.user_id === USER_ANA)).toBe(true);
  });

  it("mismo teléfono, mismo salón, MISMA cuenta, dos veces ⇒ idempotente (no duplica)", async () => {
    holder.currentUser = { id: USER_ANA };
    const first = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });
    const again = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: "612345678", // otro formato del mismo número
      full_name: "Ana",
    });

    expect(first.outcome).toBe("created");
    expect(again.outcome).toBe("already_linked");
    expect(again.customer.id).toBe(first.customer.id);
    expect(customers()).toHaveLength(1);
  });

  it("el índice es el BACKSTOP: una carrera (23505) se re-resuelve enlazando, sin duplicar", async () => {
    // Ficha existente sin cuenta cuyo phone_e164 coincide con el de Ana, pero que el
    // PRIMER pre-chequeo por teléfono no verá (simula la carrera): el código intentará
    // insertar, chocará con el único (23505) y re-resolverá enlazándola.
    holder.currentUser = { id: USER_ANA };
    customers().push({
      id: "cust-ana",
      salon_id: SALON_A,
      full_name: "Ana",
      user_id: null,
      phone: "612345678",
      phone_e164: PHONE_ANA,
    });
    holder.hidePhoneOnce.add(`${SALON_A}::${PHONE_ANA}`); // el pre-chequeo fallará una vez

    const result = await linkOrCreateCustomerAccount({
      salon_id: SALON_A,
      user_id: USER_ANA,
      phone: PHONE_ANA,
      full_name: "Ana",
    });

    // Perdió la carrera del insert pero convergió: enlazó la ficha existente.
    expect(result.outcome).toBe("linked");
    expect(result.customer.id).toBe("cust-ana");
    expect(result.customer.user_id).toBe(USER_ANA);
    expect(customers()).toHaveLength(1); // jamás una segunda ficha
  });

  it("carrera perdida ante OTRA cuenta (23505) ⇒ conflicto, sin enlazar ni duplicar", async () => {
    // Como el anterior, pero la ficha 'oculta' es de OTRA persona (Bea). Ana pierde
    // la carrera del insert (23505) y, al re-resolver por teléfono, encuentra la
    // ficha de Bea → conflicto claro (ejercita la rama byPhone del recovery 23505
    // en account.ts, con existing.user_id de un tercero, no null).
    holder.currentUser = { id: USER_ANA };
    customers().push({
      id: "cust-bea",
      salon_id: SALON_A,
      full_name: "Bea",
      user_id: USER_BEA,
      phone: "612345678",
      phone_e164: PHONE_ANA,
    });
    holder.hidePhoneOnce.add(`${SALON_A}::${PHONE_ANA}`);

    await expect(
      linkOrCreateCustomerAccount({
        salon_id: SALON_A,
        user_id: USER_ANA,
        phone: PHONE_ANA,
        full_name: "Ana",
      }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });

    expect(customers()).toHaveLength(1); // no se creó ninguna ficha
    expect(customers()[0]?.user_id).toBe(USER_BEA); // la de Bea, intacta
  });
});
