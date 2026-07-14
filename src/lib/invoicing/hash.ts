/**
 * Huella (hash) y encadenamiento SHA-256 de los registros de facturación.
 *
 * ── Qué exige Veri*factu ─────────────────────────────────────────────────────
 * Cada "registro de facturación de alta" lleva una HUELLA (SHA-256) calculada
 * sobre un conjunto acotado de campos del propio registro MÁS la huella del
 * registro anterior de la misma cadena (emisor). Así los registros quedan
 * encadenados: alterar uno rompe la huella de todos los siguientes.
 *
 * La cadena de este proyecto es por `(salon_id, series)`: `previous_hash`
 * referencia el `current_hash` del registro inmediatamente anterior de la serie
 * (FK `pos_invoices_chain_fkey`). El primero de la cadena no tiene anterior
 * (`previous_hash = null`), y en la cadena de huella se representa como cadena
 * vacía, tal como hace la especificación de la AEAT.
 *
 * ── Formato de la cadena canónica ────────────────────────────────────────────
 * Se replica el estilo de la AEAT: pares `Clave=valor` unidos por `&`, en un
 * ORDEN FIJO. El orden y el formato de cada valor son parte del contrato: si
 * cambian, cambia la huella. Por eso viven aquí, centralizados y con tests.
 *
 *   IDEmisorFactura           NIF/CIF del emisor
 *   NumSerieFactura           número visible de factura (serie-número)
 *   FechaExpedicionFactura    fecha de expedición, dd-mm-yyyy
 *   TipoFactura               F1 (completa) | F2 (simplificada/ticket)
 *   CuotaTotal                Σ cuotas de IVA, en euros con 2 decimales
 *   ImporteTotal              total de la factura, en euros con 2 decimales
 *   Huella                    huella del registro anterior ('' si es el primero)
 *   FechaHoraHusoGenRegistro  sello de tiempo de generación, ISO 8601 con huso
 *
 * La huella resultante es SHA-256 en hexadecimal MAYÚSCULAS (64 caracteres),
 * compatible con el CHECK `^[0-9A-Fa-f]{64}$` de la tabla `pos_invoices`.
 */
import { createHash } from "node:crypto";

import { centsToSpecAmount, formatSpecDate } from "./spec-format";

/** Tipo de factura Veri*factu según el tipo interno del registro. */
export type VerifactuInvoiceCode = "F1" | "F2";

/** Campos que entran en la huella de un registro de facturación de alta. */
export interface HashableInvoiceRecord {
  /** NIF/CIF del emisor (IDEmisorFactura). */
  issuerTaxId: string;
  /** Número visible de factura, serie-número (NumSerieFactura). */
  invoiceNumber: string;
  /** Fecha de expedición de la factura (FechaExpedicionFactura). */
  issuedAt: Date;
  /** Tipo Veri*factu: F1 factura completa, F2 simplificada/ticket. */
  invoiceCode: VerifactuInvoiceCode;
  /** Σ cuotas de IVA, en céntimos enteros (CuotaTotal). */
  taxCents: number;
  /** Total de la factura, en céntimos enteros (ImporteTotal). */
  totalCents: number;
  /** Huella del registro anterior de la cadena; `null` si es el primero. */
  previousHash: string | null;
  /** Sello de tiempo de generación del registro (FechaHoraHusoGenRegistro). */
  generatedAt: Date;
}

/**
 * Construye la cadena canónica (pares `Clave=valor` unidos por `&`) sobre la que
 * se calcula la huella. Aislada de {@link computeInvoiceHash} para poder auditar
 * y testear el contenido EXACTO que se firma.
 */
export function buildCanonicalString(record: HashableInvoiceRecord): string {
  const fields: Array<[string, string]> = [
    ["IDEmisorFactura", record.issuerTaxId],
    ["NumSerieFactura", record.invoiceNumber],
    ["FechaExpedicionFactura", formatSpecDate(record.issuedAt)],
    ["TipoFactura", record.invoiceCode],
    ["CuotaTotal", centsToSpecAmount(record.taxCents)],
    ["ImporteTotal", centsToSpecAmount(record.totalCents)],
    // El primer registro de la cadena firma Huella vacía (convención AEAT).
    ["Huella", record.previousHash ?? ""],
    ["FechaHoraHusoGenRegistro", record.generatedAt.toISOString()],
  ];
  return fields.map(([key, value]) => `${key}=${value}`).join("&");
}

/**
 * Calcula la huella SHA-256 (hex MAYÚSCULAS, 64 chars) del registro, encadenada
 * con `previousHash`. Determinista: mismos campos ⇒ misma huella.
 */
export function computeInvoiceHash(record: HashableInvoiceRecord): string {
  const canonical = buildCanonicalString(record);
  return createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase();
}

/**
 * Reverifica que una cadena de registros está intacta: cada huella coincide con
 * la recalculada y cada `previousHash` apunta a la huella del registro previo.
 * Devuelve el índice del primer registro corrupto, o `-1` si la cadena es válida.
 *
 * Los registros deben llegar ORDENADOS por número secuencial ascendente.
 */
export function verifyHashChain(
  records: ReadonlyArray<HashableInvoiceRecord & { currentHash: string }>,
): number {
  let expectedPrevious: string | null = null;
  for (const [index, record] of records.entries()) {
    if (record.previousHash !== expectedPrevious) {
      return index; // el eslabón no apunta al registro anterior
    }
    if (computeInvoiceHash(record) !== record.currentHash) {
      return index; // la huella no cuadra con el contenido → manipulado
    }
    expectedPrevious = record.currentHash;
  }
  return -1;
}
