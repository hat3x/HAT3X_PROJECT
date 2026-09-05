/**
 * seed-demo-invoices.ts — Planificador PURO y DETERMINISTA de las FACTURAS demo (sub-8).
 * ---------------------------------------------------------------------------
 * Decide QUÉ ventas del TPV se facturan y CÓMO (tipo F2/ticket o F1/completa, y el
 * destinatario ficticio de las F1). Hermano de `seed-demo-sales.ts` (plan de ventas):
 * `scripts/seed-demo-salon.ts` lo consume para EMITIR las facturas (`pos_invoices`)
 * reutilizando `@/lib/invoicing` (`emitInvoice` → numeración correlativa + huella
 * SHA-256 encadenada); los tests lo importan para verificar sus invariantes SIN BD.
 *
 * REGLA DE ORO: módulo **puro**, sin acceso a BD, sin `process`, sin Node APIs, sin
 * `Math.random()` ni la hora de pared. Toda la aleatoriedad es un PRNG DETERMINISTA
 * sembrado por el `saleId` (UUID estable de la venta ya sembrada), de modo que:
 *   · DETERMINISTA — misma entrada ⇒ mismo plan SIEMPRE. Requisito de la idempotencia
 *     del seed: las facturas son INMUTABLES (no se pueden borrar ni rehacer), así que
 *     la selección debe ser estable y el dedup por `sale_id` reconoce las ya emitidas.
 *   · TESTEABLE — se importa tal cual desde Vitest (no arrastra el cliente admin ni el
 *     motor de huella, que vive en `@/lib/invoicing`).
 *
 * QUÉ MODELA (fiel a la petición del cliente):
 *   · UN SUBCONJUNTO de las ventas se factura (~100–300), NO todas: el resto queda
 *     como ticket simple (venta sin factura), tal como dejó sub-7.
 *   · MEZCLA F2 (mayoría) + algunas F1 — la mayoría son tickets simplificados (sin
 *     receptor, Veri*factu F2) y una minoría (~`DEFAULT_F1_RATE`) son facturas
 *     completas (F1) con DESTINATARIO ficticio (nombre del cliente demo + NIF de
 *     forma válida, inexistente en la AEAT, igual de ficticio que el del salón demo).
 *   · ORDEN TEMPORAL ASCENDENTE — el plan se ordena por `soldAtIso`, así el llamador
 *     emite en orden cronológico y `issued_at` queda ascendente dentro de la serie.
 *
 * La NUMERACIÓN correlativa sin huecos, el `previous_hash` y la HUELLA SHA-256 los
 * resuelve `emitInvoice` (no se reimplementan aquí). Ver `docs/seed-demo-contracts.md`
 * §3 (facturación Veri*factu).
 */

// ───────────────────────────────────────────────────────────────────────────
// Constantes de recuento y mezcla (petición del cliente: ~100–300, F2 mayoría).
// ───────────────────────────────────────────────────────────────────────────

/** Serie de facturación DEDICADA del salón demo (cadena de huella por `(salon_id, series)`). */
export const DEMO_INVOICE_SERIES = "DEMO-2026";

/** Nº de facturas demo por defecto (dentro del rango pedido 100–300). */
export const DEFAULT_DEMO_INVOICE_COUNT = 200;
/** Mínimo de facturas demo (petición del cliente: ~100–300). */
export const MIN_DEMO_INVOICE_COUNT = 100;
/** Máximo de facturas demo (petición del cliente: ~100–300). */
export const MAX_DEMO_INVOICE_COUNT = 300;

/** Fracción de facturas que son F1/completa (con destinatario); el resto F2/ticket. */
export const DEFAULT_F1_RATE = 0.2;

/**
 * Recuento de facturas a emitir: entero saturado al rango pedido 100–300, por defecto
 * 200. Espejo de `resolveCustomerCount` (sub-5). Se satura al máximo REAL disponible
 * (nº de ventas facturables) en la capa de siembra: aquí solo se acota el objetivo.
 */
export function resolveInvoiceCount(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_DEMO_INVOICE_COUNT;
  return Math.min(MAX_DEMO_INVOICE_COUNT, Math.max(MIN_DEMO_INVOICE_COUNT, value));
}

// ───────────────────────────────────────────────────────────────────────────
// PRNG determinista (hash FNV-1a → [0, 1)). NO usa Math.random (rompería la idempotencia).
// ───────────────────────────────────────────────────────────────────────────

/** Hash entero estable (FNV-1a, uint32) de un texto — misma familia que los hermanos. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Número determinista en [0, 1) a partir de una clave de texto (para decidir F1/F2). */
function unitFromKey(key: string): number {
  return hashString(key) / 4294967296;
}

// ───────────────────────────────────────────────────────────────────────────
// NIF ficticio (destinatario de las F1) — DNI de FORMA válida, inexistente en la AEAT.
// ───────────────────────────────────────────────────────────────────────────

/** Letras de control del DNI español, indexadas por `número mod 23` (algoritmo oficial). */
const DNI_CONTROL_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/**
 * NIF ficticio DETERMINISTA con FORMA de DNI español válido: 8 dígitos + letra de
 * control correcta (`número mod 23`). Es ficticio (no existe en la AEAT), como el
 * `B00000000` del emisor demo, pero pasa una validación de forma. Sirve de destinatario
 * de las facturas completas (F1) de clientes demo que no tienen NIF fichado.
 */
export function syntheticNif(seed: string): string {
  const number = hashString(`nif:${seed}`) % 100_000_000;
  const letter = DNI_CONTROL_LETTERS.charAt(number % 23);
  return `${number.toString().padStart(8, "0")}${letter}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Tipos de entrada/salida del plan.
// ───────────────────────────────────────────────────────────────────────────

/** Una venta candidata a factura, resuelta a datos reales por la capa de siembra. */
export interface DemoInvoiceSaleInput {
  /** Id (UUID) de la venta origen; ancla del dedup y semilla del PRNG de mezcla. */
  saleId: string;
  /** Instante de cobro en ISO 8601 UTC (`pos_sales.sold_at`); base del orden y de `issued_at`. */
  soldAtIso: string;
  /** Cliente atendido (para el destinatario de las F1). `null` si la venta no lo tiene. */
  customerId: string | null;
  /** Nombre del cliente (snapshot del receptor F1). `null`/vacío ⇒ la venta solo puede ser F2. */
  customerName: string | null;
  /** Dirección postal/fiscal del cliente (receptor F1). `null` si no consta. */
  customerAddress: string | null;
  /** Total de la venta en céntimos (IVA incl.). Debe ser > 0 para poder facturarse. */
  totalCents: number;
}

/** Datos del destinatario de una factura completa (F1). Ausente (`null`) en el ticket (F2). */
export interface DemoInvoiceRecipient {
  /** NIF/CIF del receptor (ficticio, forma válida). */
  taxId: string;
  /** Nombre o razón social del receptor. */
  name: string;
  /** Dirección postal/fiscal del receptor, o `null`. */
  address: string | null;
}

/** Una factura planificada: qué venta, de qué tipo, con qué fecha y (si F1) receptor. */
export interface DemoInvoicePlanItem {
  /** Venta de origen (trazabilidad TPV→factura; `pos_invoices.sale_id`). */
  saleId: string;
  /** Tipo Veri*factu interno: `'ticket'` (F2, mayoría) | `'completa'` (F1, con receptor). */
  invoiceType: "ticket" | "completa";
  /** Fecha de expedición (backdated al cobro de la venta). Garantiza orden ascendente. */
  issuedAtIso: string;
  /** Receptor de la F1; `null` en el ticket (F2, anónimo). */
  recipient: DemoInvoiceRecipient | null;
}

/** Parámetros del planificador (todo inyectado ⇒ pureza y determinismo). */
export interface SelectInvoicePlanParams {
  /** Ventas facturables candidatas (con total > 0), resueltas por la capa de siembra. */
  sales: readonly DemoInvoiceSaleInput[];
  /** Nº objetivo de facturas (de `resolveInvoiceCount`); se satura al nº de ventas. */
  targetCount: number;
  /** Fracción de F1/completa. Por defecto `DEFAULT_F1_RATE`. */
  f1Rate?: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Planificador principal.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Selecciona el SUBCONJUNTO de ventas a facturar y asigna a cada una su tipo y receptor.
 *
 *  · SELECCIÓN determinista y REPARTIDA en el tiempo: se ordenan las ventas por instante
 *    de cobro (ascendente) y se toman `min(targetCount, nº ventas)` con paso uniforme, de
 *    modo que las facturas quedan espaciadas por todo el histórico (no amontonadas).
 *  · ORDEN ASCENDENTE: el plan sale ordenado por `issuedAtIso` (= `soldAtIso`), así el
 *    llamador emite en orden cronológico ⇒ `issued_at` ascendente dentro de la serie.
 *  · MEZCLA F2/F1: por venta, un umbral PRNG sembrado por `saleId` decide F1 (con umbral
 *    `f1Rate`) frente a F2. Solo puede ser F1 si la venta tiene NOMBRE de cliente (el
 *    receptor lo exige); si no, cae a F2. El NIF del receptor es `syntheticNif(...)`.
 *
 * DETERMINISTA: mismas ventas + mismos parámetros ⇒ mismo plan. Base de la idempotencia
 * (las facturas son inmutables: el llamador salta por `sale_id` las ya emitidas).
 */
export function selectInvoicePlan(params: SelectInvoicePlanParams): DemoInvoicePlanItem[] {
  const { sales, targetCount, f1Rate = DEFAULT_F1_RATE } = params;

  // Solo ventas facturables (total > 0), ordenadas por cobro asc. (empates → saleId estable).
  const eligible = sales
    .filter((sale) => sale.totalCents > 0)
    .slice()
    .sort((a, b) => {
      if (a.soldAtIso !== b.soldAtIso) return a.soldAtIso < b.soldAtIso ? -1 : 1;
      return a.saleId < b.saleId ? -1 : a.saleId > b.saleId ? 1 : 0;
    });

  const count = Math.min(Math.max(Math.trunc(targetCount), 0), eligible.length);
  const plan: DemoInvoicePlanItem[] = [];

  for (let i = 0; i < count; i += 1) {
    // Paso uniforme: índices crecientes y distintos (count ≤ eligible.length).
    const index = Math.floor((i * eligible.length) / count);
    const sale = eligible[index];
    if (sale === undefined) continue; // inalcanzable; seguro bajo noUncheckedIndexedAccess

    const name = sale.customerName?.trim() ?? "";
    const canBeF1 = f1Rate > 0 && name.length > 0;
    const isF1 = canBeF1 && unitFromKey(`f1:${sale.saleId}`) < f1Rate;

    const recipient: DemoInvoiceRecipient | null = isF1
      ? {
          taxId: syntheticNif(sale.customerId ?? sale.saleId),
          name,
          address: sale.customerAddress,
        }
      : null;

    plan.push({
      saleId: sale.saleId,
      invoiceType: isF1 ? "completa" : "ticket",
      issuedAtIso: sale.soldAtIso,
      recipient,
    });
  }

  return plan;
}
