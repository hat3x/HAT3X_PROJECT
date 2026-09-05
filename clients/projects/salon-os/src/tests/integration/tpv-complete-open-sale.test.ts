/**
 * `createSale` cerrando un ticket que YA existe.
 *
 * "Pasar a caja" desde un presupuesto deja una venta en estado `open` con sus
 * líneas, y la línea del presupuesto queda colgando de ella. Si al cobrarla la
 * caja creara una venta NUEVA, la primera se quedaría huérfana: un ticket
 * abierto que nadie va a cobrar nunca, y un presupuesto diciendo "pendiente"
 * para siempre.
 *
 * Lo que se prueba aquí es justo eso: que ese camino ACTUALIZA en vez de
 * insertar, que no lo hace si el ticket dejó de estar abierto, y que el camino
 * normal —sin ticket previo— sigue creando la venta como siempre.
 *
 * Supabase se dobla con un builder que registra las operaciones, para poder
 * afirmar sobre lo que se escribió y no solo sobre lo que se devolvió.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { SaleInput } from "@/lib/validations/sale";

const SALON_ID = "salon-1";
const USER_ID = "user-1";
const SALE_ID = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  /** Traza de escrituras: `${tabla}:${operacion}`. */
  ops: [] as string[],
  /** Si el UPDATE de pos_sales encuentra la venta abierta. */
  ticketSigueAbierto: true,
  /**
   * Filtros aplicados en la cadena, como `${tabla}.${columna}=${valor}`.
   *
   * Hacen falta porque este doble NO filtra de verdad: sin registrarlos, quitar
   * el `.eq("status","open")` del código —la guarda contra el doble cobro— no
   * haría fallar ningún test, y el test estaría afirmando algo que no comprueba.
   */
  filtros: [] as string[],
}));

function resolve(table: string, op: string): { data: unknown; error: null } {
  if (op !== "select") h.ops.push(`${table}:${op}`);

  if (table === "pos_sales" && op === "insert") {
    return { data: { id: SALE_ID }, error: null };
  }
  if (table === "pos_sales" && op === "update") {
    // `null` = el `.eq("status","open")` no casó: alguien lo cobró antes.
    return { data: h.ticketSigueAbierto ? { id: SALE_ID } : null, error: null };
  }
  return { data: null, error: null };
}

function makeBuilder(table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  const b = {
    select: () => b,
    eq: (columna: string, valor: unknown) => {
      h.filtros.push(`${table}.${columna}=${String(valor)}`);
      return b;
    },
    gt: () => b,
    is: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    insert: () => {
      op = "insert";
      return b;
    },
    update: () => {
      op = "update";
      return b;
    },
    delete: () => {
      op = "delete";
      return b;
    },
    maybeSingle: () => Promise.resolve(resolve(table, op)),
    single: () => Promise.resolve(resolve(table, op)),
    then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
      onFulfilled(resolve(table, op)),
  };
  return b;
}

function makeClient() {
  return {
    from: (table: string) => makeBuilder(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }),
    },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/salon", () => ({ getActiveSalonId: () => Promise.resolve(SALON_ID) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

import { createSale } from "@/app/(dashboard)/tpv/actions";

/** Venta base: una línea manual de 10,00 € y un tender exacto. */
function venta(over: Partial<SaleInput> = {}): SaleInput {
  return {
    lines: [
      {
        kind: "manual",
        refId: null,
        description: "Endodoncia",
        quantity: "1",
        unitPrice: "10,00",
        vatRate: "21",
      },
    ],
    tenders: [{ method: "efectivo", amount: "10,00" }],
    ...over,
  };
}

beforeEach(() => {
  h.ops = [];
  h.filtros = [];
  h.ticketSigueAbierto = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createSale · cerrar un ticket abierto", () => {
  it("con ticket previo ACTUALIZA la venta; no crea otra", async () => {
    const r = await createSale(venta({ saleId: SALE_ID }));

    expect(r.ok).toBe(true);
    expect(h.ops).toContain("pos_sales:update");
    // La comprobación que de verdad importa: ni una venta de más.
    expect(h.ops).not.toContain("pos_sales:insert");
    // Y acotada al ticket, a su salón y a que SIGA abierto. Ese último filtro
    // es la guarda contra el doble cobro: sin él, cobrar dos veces el mismo
    // ticket lo cobraría dos veces de verdad.
    expect(h.filtros).toContain(`pos_sales.id=${SALE_ID}`);
    expect(h.filtros).toContain(`pos_sales.salon_id=${SALON_ID}`);
    expect(h.filtros).toContain("pos_sales.status=open");
  });

  it("reescribe las líneas del ticket: el cajero pudo tocarlas antes de cobrar", async () => {
    await createSale(venta({ saleId: SALE_ID }));

    const borrado = h.ops.indexOf("pos_sale_lines:delete");
    const alta = h.ops.indexOf("pos_sale_lines:insert");
    expect(borrado).toBeGreaterThanOrEqual(0);
    expect(alta).toBeGreaterThan(borrado); // primero se limpian, luego se escriben
  });

  it("si el ticket ya no está abierto, se para antes de tocar las líneas", async () => {
    h.ticketSigueAbierto = false;

    const r = await createSale(venta({ saleId: SALE_ID }));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya no está abierto/i);
    // Es la guarda contra el doble cobro: si otra persona lo cobró entre medias,
    // no se le vuelve a cobrar al paciente ni se reescribe nada.
    expect(h.ops).not.toContain("pos_sale_lines:delete");
    expect(h.ops).not.toContain("pos_sale_lines:insert");
  });

  it("sin ticket previo sigue creando la venta, como siempre", async () => {
    const r = await createSale(venta());

    expect(r.ok).toBe(true);
    expect(h.ops).toContain("pos_sales:insert");
    expect(h.ops).not.toContain("pos_sales:update");
    // Y no borra líneas: no había ninguna que reescribir.
    expect(h.ops).not.toContain("pos_sale_lines:delete");
  });
});
