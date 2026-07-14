/**
 * Orquestador de emisión de facturas Veri*factu.
 *
 * Solo se ejecuta en servidor: recibe un cliente Supabase de servidor (scopeado
 * por RLS) desde el Server Action y nunca se importa en cliente.
 *
 * Resuelve lo que el motor puro (`engine.ts`) no puede: la NUMERACIÓN SECUENCIAL
 * SIN HUECOS por serie y el eslabón anterior de la cadena de huellas, y persiste
 * el registro inmutable en `pos_invoices`.
 *
 * ── Numeración sin huecos con concurrencia ───────────────────────────────────
 * supabase-js no expone transacciones multi-sentencia desde el cliente, así que
 * se usa CONCURRENCIA OPTIMISTA apoyada en las restricciones de la tabla:
 *   1. Se lee el último registro de la serie (mayor `sequential_number`) para
 *      obtener el siguiente número y el `previous_hash` (su `current_hash`).
 *   2. Se construye el registro y se inserta.
 *   3. Si dos emisiones compiten, ambas intentan el MISMO número → la `unique
 *      (salon_id, series, sequential_number)` (o la de `current_hash`) rechaza
 *      una con `23505`. Como un insert fallido NO deja fila, la serie queda SIN
 *      HUECOS: se reintenta releyendo el último número.
 * El bucle está acotado (`MAX_ATTEMPTS`) para no girar indefinidamente.
 *
 * La INMUTABILIDAD la garantiza la BD (trigger `trg_pos_invoices_immutable` +
 * ausencia de policies UPDATE/DELETE); aquí solo insertamos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SaleTotals } from "@/lib/payments";
import type { Database, PosInvoice, PosInvoiceType } from "@/types/database";

import {
  buildInvoiceRecord,
  InvoiceEmissionError,
  type IssuerData,
  type RecipientData,
} from "./engine";

/** Nº máximo de reintentos ante colisión de numeración concurrente. */
const MAX_ATTEMPTS = 5;

/** Código PostgreSQL de violación de unicidad. */
const UNIQUE_VIOLATION = "23505";

/** Parámetros de una emisión (numeración y cadena se resuelven aquí dentro). */
export interface EmitInvoiceParams {
  salonId: string;
  saleId: string | null;
  invoiceType: PosInvoiceType;
  series: string;
  totals: SaleTotals;
  issuer: IssuerData;
  recipient: RecipientData | null;
  /** Fecha de expedición. Por defecto, ahora. */
  issuedAt?: Date;
  currency?: string;
}

/** Resultado de una emisión con éxito. */
export interface EmittedInvoice {
  invoiceId: string;
  fullNumber: string;
  series: string;
  sequentialNumber: number;
  invoiceType: PosInvoiceType;
  currentHash: string;
  previousHash: string | null;
  totalCents: number;
  taxCents: number;
  taxableBaseCents: number;
  issuedAt: string;
}

/** Último registro de una serie: base para el siguiente número y el eslabón. */
interface SeriesTail {
  sequentialNumber: number;
  currentHash: string;
}

/**
 * Lee el último registro de la serie (mayor `sequential_number`) dentro del
 * salón. Devuelve `null` si la serie está vacía (el próximo será el nº 1).
 */
async function fetchSeriesTail(
  supabase: SupabaseClient<Database>,
  salonId: string,
  series: string,
): Promise<SeriesTail | null> {
  const { data, error } = await supabase
    .from("pos_invoices")
    .select("sequential_number, current_hash")
    .eq("salon_id", salonId)
    .eq("series", series)
    .order("sequential_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`No se pudo leer la serie de facturación: ${error.message}`);
  }
  if (data === null) return null;
  return { sequentialNumber: data.sequential_number, currentHash: data.current_hash };
}

/** `true` si el error de Postgres/PostgREST es una violación de unicidad. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

/**
 * Emite una factura: asigna número correlativo sin huecos, encadena la huella,
 * y persiste el registro inmutable. Reintenta ante colisión de numeración.
 *
 * @throws {InvoiceEmissionError} si faltan datos obligatorios o se agotan los
 *   reintentos de numeración.
 */
export async function emitInvoice(
  supabase: SupabaseClient<Database>,
  params: EmitInvoiceParams,
): Promise<EmittedInvoice> {
  const issuedAt = params.issuedAt ?? new Date();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const tail = await fetchSeriesTail(supabase, params.salonId, params.series);
    const sequentialNumber = tail === null ? 1 : tail.sequentialNumber + 1;
    const previousHash = tail?.currentHash ?? null;

    // `generatedAt` se recalcula por intento: es el sello de alta en la cadena.
    const built = buildInvoiceRecord({
      salonId: params.salonId,
      saleId: params.saleId,
      invoiceType: params.invoiceType,
      series: params.series,
      sequentialNumber,
      issuedAt,
      generatedAt: new Date(),
      totals: params.totals,
      issuer: params.issuer,
      recipient: params.recipient,
      previousHash,
      currency: params.currency,
    });

    const { data, error } = await supabase
      .from("pos_invoices")
      .insert(built.insert)
      .select("id, issued_at")
      .single();

    if (error === null && data !== null) {
      return {
        invoiceId: data.id,
        fullNumber: built.fullNumber,
        series: params.series,
        sequentialNumber,
        invoiceType: params.invoiceType,
        currentHash: built.currentHash,
        previousHash,
        totalCents: params.totals.totalCents,
        taxCents: params.totals.taxCents,
        taxableBaseCents: params.totals.subtotalCents,
        issuedAt: data.issued_at,
      };
    }

    // Colisión de numeración concurrente → releer y reintentar (sin dejar hueco).
    if (isUniqueViolation(error)) {
      continue;
    }

    throw new Error(
      `No se pudo emitir la factura: ${error?.message ?? "error desconocido"}`,
    );
  }

  throw new InvoiceEmissionError(
    `No se pudo asignar número de factura en la serie "${params.series}" tras ${MAX_ATTEMPTS} intentos (alta concurrencia). Inténtalo de nuevo.`,
  );
}

/** Reexport de utilidad para consumidores que solo importan el orquestador. */
export type { PosInvoice };
