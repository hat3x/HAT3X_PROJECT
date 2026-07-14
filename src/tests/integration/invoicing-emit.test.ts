/**
 * Tests de integración del ORQUESTADOR de emisión Veri*factu (`@/lib/invoicing`
 * → `emitInvoice`), ejercitado contra un doble EN MEMORIA de `pos_invoices` que
 * reproduce las restricciones reales de la tabla:
 *
 *   · unicidad `(salon_id, series, sequential_number)` y de `current_hash`;
 *   · lectura del último registro de la serie DENTRO del salón (aislamiento);
 *   · inserción atómica que, ante colisión, devuelve el código PostgreSQL 23505.
 *
 * Con eso se cubre, sobre la capa de pagos + el motor Verifactu enchufados de
 * verdad (no en aislamiento), lo que exige la subtarea sub-14:
 *
 *   1. NUMERACIÓN SECUENCIAL SIN HUECOS por serie (1, 2, 3… y series
 *      independientes) y reanudación sin hueco tras una colisión concurrente.
 *   2. AISLAMIENTO MULTI-TENANT: la serie de un salón no ve ni afecta a la de
 *      otro, aunque compartan nombre de serie (numeración por `salon_id`).
 *   3. ENCADENAMIENTO SHA-256 de punta a punta: cada `previous_hash` apunta a la
 *      huella del registro anterior y ALTERAR un registro invalida la cadena
 *      posterior (la huella recalculada deja de cuadrar con el eslabón que la
 *      referencia).
 *
 * La aritmética de IVA/totales por línea y la huella pura tienen sus propios
 * tests unitarios (`payments-totals`, `invoicing-hash`, `invoicing-engine`); aquí
 * el foco es el comportamiento del orquestador con estado persistente y concurrencia.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeEach } from "vitest";

import { computeSaleTotals, type SaleTotals } from "@/lib/payments";
import {
  emitInvoice,
  computeInvoiceHash,
  InvoiceEmissionError,
  verifyHashChain,
  type EmitInvoiceParams,
  type HashableInvoiceRecord,
  type IssuerData,
} from "@/lib/invoicing";
import type { Database } from "@/types/database";

// ─────────────────────────────────────────────────────────────────────────────
// Escenario (UUIDs sintéticos, no datos reales).
// ─────────────────────────────────────────────────────────────────────────────
const SALON_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SALON_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const ISSUER: IssuerData = {
  taxId: "B12345678",
  legalName: "Salón Bella S.L.",
  fiscalAddress: "Calle Mayor 1, Madrid",
};

/** Emisor del salón B: cada salón factura con SU PROPIO NIF (chains distintas). */
const ISSUER_B: IssuerData = {
  taxId: "B87654321",
  legalName: "Peluquería Nova S.L.",
  fiscalAddress: "Avenida del Sol 9, Sevilla",
};

/** Fecha de expedición fija: la numeración/encadenado no debe depender del reloj. */
const ISSUED_AT = new Date("2026-07-14T09:00:00.000Z");

/** Totales de una venta simple de 12,10 € (base 10,00 € + 21% IVA). */
function saleTotals(grossCents = 1210, vatRate = 21): SaleTotals {
  return computeSaleTotals([{ quantity: 1, unitPriceCents: grossCents, vatRate }]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Doble EN MEMORIA de `pos_invoices`.
//
// Guarda el payload íntegro de cada insert (incluye `current_hash`,
// `previous_hash`, `created_at`…), aplica las restricciones de unicidad de la
// tabla y resuelve las lecturas de la serie como lo haría PostgREST:
// filtrando por los `.eq(...)` acumulados, ordenando y limitando.
//
// `raceHook` permite inyectar UNA competidora justo antes de que un insert se
// resuelva, simulando que otra emisión ganó la carrera entre nuestra lectura
// del último número y nuestra inserción (TOCTOU) → fuerza el 23505.
// ─────────────────────────────────────────────────────────────────────────────
interface StoredRow {
  id: string;
  salon_id: string;
  series: string;
  sequential_number: number;
  current_hash: string;
  previous_hash: string | null;
  issued_at: string;
  created_at: string;
  invoice_type: "completa" | "ticket";
  tax_cents: number;
  total_cents: number;
  issuer_data: { tax_id: string };
}

class InvoiceStore {
  readonly rows: StoredRow[] = [];
  private idSeq = 0;
  /** Se dispara (y se limpia) una sola vez, antes de resolver el próximo insert. */
  raceHook: (() => void) | null = null;

  private nextId(): string {
    this.idSeq += 1;
    return `inv-${this.idSeq.toString().padStart(4, "0")}`;
  }

  /** Inserta directamente una fila competidora (simula otra emisión ganadora). */
  injectCompetitor(row: Omit<StoredRow, "id">): void {
    this.rows.push({ id: this.nextId(), ...row });
  }

  from(table: string) {
    if (table !== "pos_invoices") {
      throw new Error(`tabla no soportada por el doble: ${table}`);
    }
    return new Builder(this);
  }

  /** Alta con enforcement de unicidad; devuelve el resultado estilo PostgREST. */
  insert(
    payload: StoredRow,
  ): { data: unknown; error: { code?: string; message: string } | null } {
    if (this.raceHook) {
      const hook = this.raceHook;
      this.raceHook = null;
      hook();
    }
    const dupNumber = this.rows.some(
      (r) =>
        r.salon_id === payload.salon_id &&
        r.series === payload.series &&
        r.sequential_number === payload.sequential_number,
    );
    const dupHash = this.rows.some((r) => r.current_hash === payload.current_hash);
    if (dupNumber || dupHash) {
      return {
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      };
    }
    const row: StoredRow = { ...payload, id: this.nextId() };
    this.rows.push(row);
    return { data: { id: row.id, issued_at: row.issued_at }, error: null };
  }
}

/** Builder encadenable que acumula filtros y resuelve lecturas/escrituras. */
class Builder {
  private filters: Array<[string, unknown]> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private pendingInsert: StoredRow | null = null;

  constructor(private readonly store: InvoiceStore) {}

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  insert(payload: StoredRow) {
    this.pendingInsert = payload;
    return this;
  }

  private readList(): StoredRow[] {
    let out = this.store.rows.filter((r) =>
      this.filters.every(
        ([col, val]) => (r as unknown as Record<string, unknown>)[col] === val,
      ),
    );
    if (this.orderCol) {
      const col = this.orderCol;
      out = [...out].sort((a, b) => {
        const av = (a as unknown as Record<string, number>)[col] ?? 0;
        const bv = (b as unknown as Record<string, number>)[col] ?? 0;
        return this.orderAsc ? av - bv : bv - av;
      });
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }

  maybeSingle() {
    const list = this.readList();
    return Promise.resolve({ data: list[0] ?? null, error: null });
  }

  single() {
    if (this.pendingInsert) {
      return Promise.resolve(this.store.insert(this.pendingInsert));
    }
    const list = this.readList();
    return Promise.resolve({ data: list[0] ?? null, error: null });
  }
}

/** Adapta el doble a la firma que `emitInvoice` espera. */
function asClient(store: InvoiceStore): SupabaseClient<Database> {
  return store as unknown as SupabaseClient<Database>;
}

/** Params de emisión de un ticket (F2), rellenando lo mínimo por defecto. */
function ticketParams(overrides: Partial<EmitInvoiceParams> = {}): EmitInvoiceParams {
  return {
    salonId: SALON_A,
    saleId: null,
    invoiceType: "ticket",
    series: "T",
    totals: saleTotals(),
    issuer: ISSUER,
    recipient: null,
    issuedAt: ISSUED_AT,
    ...overrides,
  };
}

/** Reconstruye el registro firmable a partir de la fila persistida. */
function toHashable(row: StoredRow): HashableInvoiceRecord & { currentHash: string } {
  return {
    issuerTaxId: row.issuer_data.tax_id,
    invoiceNumber: `${row.series}-${row.sequential_number}`,
    issuedAt: new Date(row.issued_at),
    invoiceCode: row.invoice_type === "completa" ? "F1" : "F2",
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    previousHash: row.previous_hash,
    generatedAt: new Date(row.created_at),
    currentHash: row.current_hash,
  };
}

let store: InvoiceStore;
beforeEach(() => {
  store = new InvoiceStore();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("numeración secuencial sin huecos por serie", () => {
  it("asigna 1 al primer registro de una serie vacía", async () => {
    const emitted = await emitInvoice(asClient(store), ticketParams());
    expect(emitted.sequentialNumber).toBe(1);
    expect(emitted.fullNumber).toBe("T-1");
    expect(emitted.previousHash).toBeNull();
  });

  it("numera 1, 2, 3… correlativo dentro de la misma serie", async () => {
    const first = await emitInvoice(asClient(store), ticketParams());
    const second = await emitInvoice(asClient(store), ticketParams());
    const third = await emitInvoice(asClient(store), ticketParams());

    expect([first, second, third].map((e) => e.sequentialNumber)).toEqual([1, 2, 3]);
    // Sin huecos: los números persistidos son exactamente {1,2,3}.
    const numbers = store.rows
      .filter((r) => r.series === "T")
      .map((r) => r.sequential_number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it("mantiene numeración independiente por serie dentro del mismo salón", async () => {
    await emitInvoice(asClient(store), ticketParams({ series: "T" }));
    await emitInvoice(asClient(store), ticketParams({ series: "T" }));
    const otherSeries = await emitInvoice(
      asClient(store),
      ticketParams({
        series: "F",
        invoiceType: "completa",
        recipient: { taxId: "12345678Z", name: "Cliente", address: null },
      }),
    );
    // La serie "F" arranca en 1 aunque "T" ya vaya por el 2.
    expect(otherSeries.sequentialNumber).toBe(1);
  });

  it("reanuda SIN HUECO tras una colisión concurrente (23505 → reintento)", async () => {
    // Primera factura: nº 1.
    await emitInvoice(asClient(store), ticketParams());

    // En la siguiente emisión, entre la lectura (verá tail=1 → intentará 2) y el
    // insert, otra emisión mete el nº 2. Nuestro insert choca (23505), reintenta,
    // relee (tail=2) y toma el 3: la serie queda {1,2,3}, sin huecos ni duplicados.
    store.raceHook = () => {
      const competitorTotals = saleTotals();
      const firstRow = store.rows[0];
      if (firstRow === undefined) throw new Error("precondición: falta la 1ª factura");
      const competitor: HashableInvoiceRecord = {
        issuerTaxId: ISSUER.taxId,
        invoiceNumber: "T-2",
        issuedAt: ISSUED_AT,
        invoiceCode: "F2",
        taxCents: competitorTotals.taxCents,
        totalCents: competitorTotals.totalCents,
        previousHash: firstRow.current_hash,
        generatedAt: new Date("2026-07-14T09:05:00.000Z"),
      };
      store.injectCompetitor({
        salon_id: SALON_A,
        series: "T",
        sequential_number: 2,
        current_hash: computeInvoiceHash(competitor),
        previous_hash: competitor.previousHash,
        issued_at: ISSUED_AT.toISOString(),
        created_at: competitor.generatedAt.toISOString(),
        invoice_type: "ticket",
        tax_cents: competitor.taxCents,
        total_cents: competitor.totalCents,
        issuer_data: { tax_id: ISSUER.taxId },
      });
    };

    const resumed = await emitInvoice(asClient(store), ticketParams());
    expect(resumed.sequentialNumber).toBe(3);

    const numbers = store.rows
      .filter((r) => r.series === "T")
      .map((r) => r.sequential_number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]); // sin huecos, sin duplicados
  });

  it("aborta con InvoiceEmissionError si la colisión no cede tras los reintentos", async () => {
    await emitInvoice(asClient(store), ticketParams());

    // Competidor PERPETUO: antes de cada insert, un fantasma ocupa el número que
    // vamos a intentar → todos los intentos chocan (23505) y se agotan.
    let attempts = 0;
    const original = store.insert.bind(store);
    store.insert = ((payload: StoredRow) => {
      attempts += 1;
      store.rows.push({
        ...payload,
        id: `ghost-${attempts}`,
        current_hash: `GHOST${attempts.toString().padStart(59, "0")}`,
      });
      return original(payload);
    }) as typeof store.insert;

    await expect(
      emitInvoice(asClient(store), ticketParams()),
    ).rejects.toBeInstanceOf(InvoiceEmissionError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("aislamiento multi-tenant — la serie de un salón no ve la de otro", () => {
  it("cada salón numera desde 1 en una serie con el MISMO nombre", async () => {
    // Salón A emite dos en la serie "T".
    await emitInvoice(asClient(store), ticketParams({ salonId: SALON_A, series: "T" }));
    await emitInvoice(asClient(store), ticketParams({ salonId: SALON_A, series: "T" }));

    // Salón B, misma serie "T": debe empezar en 1 (no ve los registros de A).
    const firstB = await emitInvoice(
      asClient(store),
      ticketParams({ salonId: SALON_B, series: "T", issuer: ISSUER_B }),
    );
    expect(firstB.sequentialNumber).toBe(1);
    expect(firstB.previousHash).toBeNull(); // arranca su propia cadena
  });

  it("una venta emitida por un salón no aparece en la lectura de serie de otro", async () => {
    const emittedA = await emitInvoice(
      asClient(store),
      ticketParams({ salonId: SALON_A, series: "T", saleId: "venta-de-A" }),
    );

    // El "tail" que ve el salón B para su serie "T" es vacío: no hay filas suyas.
    const rowsVisibleToB = store.rows.filter(
      (r) => r.salon_id === SALON_B && r.series === "T",
    );
    expect(rowsVisibleToB).toHaveLength(0);
    // …mientras que la fila de A existe y está aislada por salon_id.
    expect(
      store.rows.some((r) => r.id === emittedA.invoiceId && r.salon_id === SALON_A),
    ).toBe(true);
  });

  it("las cadenas de huellas de dos salones son independientes", async () => {
    const a1 = await emitInvoice(asClient(store), ticketParams({ salonId: SALON_A, series: "T" }));
    const a2 = await emitInvoice(asClient(store), ticketParams({ salonId: SALON_A, series: "T" }));
    const b1 = await emitInvoice(
      asClient(store),
      ticketParams({ salonId: SALON_B, series: "T", issuer: ISSUER_B }),
    );

    // El 2º de A encadena con el 1º de A; el 1º de B no encadena con nada de A.
    expect(a2.previousHash).toBe(a1.currentHash);
    expect(b1.previousHash).toBeNull();
    expect(b1.previousHash).not.toBe(a1.currentHash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("encadenamiento SHA-256 de punta a punta", () => {
  it("cada previous_hash apunta a la huella del registro anterior de la serie", async () => {
    const e1 = await emitInvoice(asClient(store), ticketParams());
    const e2 = await emitInvoice(asClient(store), ticketParams());
    const e3 = await emitInvoice(asClient(store), ticketParams());

    expect(e1.previousHash).toBeNull();
    expect(e2.previousHash).toBe(e1.currentHash);
    expect(e3.previousHash).toBe(e2.currentHash);

    // La cadena persistida (ordenada por número) verifica íntegra.
    const chain = store.rows
      .filter((r) => r.salon_id === SALON_A && r.series === "T")
      .sort((a, b) => a.sequential_number - b.sequential_number)
      .map(toHashable);
    expect(verifyHashChain(chain)).toBe(-1);
  });

  it("ALTERAR un registro invalida la cadena POSTERIOR", async () => {
    await emitInvoice(asClient(store), ticketParams());
    await emitInvoice(asClient(store), ticketParams());
    await emitInvoice(asClient(store), ticketParams());

    const chain = store.rows
      .filter((r) => r.series === "T")
      .sort((a, b) => a.sequential_number - b.sequential_number)
      .map(toHashable);
    expect(chain).toHaveLength(3);
    expect(verifyHashChain(chain)).toBe(-1); // intacta de partida

    const [, second, third] = chain as [
      (typeof chain)[number],
      (typeof chain)[number],
      (typeof chain)[number],
    ];

    // Se manipula el importe del 2º registro (índice 1) DESPUÉS de firmado.
    const tamperedSecond = { ...second, totalCents: second.totalCents + 100 };
    const tampered = [chain[0]!, tamperedSecond, third];

    // verifyHashChain señala el primer eslabón roto: el registro alterado.
    expect(verifyHashChain(tampered)).toBe(1);

    // Y, crucialmente, la alteración rompe el enlace del registro SIGUIENTE: la
    // huella recalculada del 2º ya no coincide con el previous_hash del 3º.
    const recomputedTamperedHash = computeInvoiceHash(tamperedSecond);
    expect(recomputedTamperedHash).not.toBe(second.currentHash);
    expect(third.previousHash).toBe(second.currentHash);
    expect(third.previousHash).not.toBe(recomputedTamperedHash);
  });
});
