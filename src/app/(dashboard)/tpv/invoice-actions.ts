"use server";

import { revalidatePath } from "next/cache";

import { computeSaleTotals, type SaleLineInput } from "@/lib/payments";
import {
  emitInvoice,
  InvoiceEmissionError,
  type EmittedInvoice,
  type IssuerData,
  type RecipientData,
} from "@/lib/invoicing";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  invoiceEmissionSchema,
  type InvoiceEmissionInput,
  type InvoiceEmissionValues,
} from "@/lib/validations/invoice";

/** Resultado tipado de un Server Action de facturación. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/** Líneas de una venta o del payload → entradas de cálculo de la capa de pagos. */
async function resolveLineInputs(
  supabase: ReturnType<typeof createClient>,
  salonId: string,
  values: InvoiceEmissionValues,
): Promise<{ lines: SaleLineInput[]; saleCustomerId: string | null } | { error: string }> {
  // Factura libre: las líneas llegan en el payload (mismo formato que el TPV).
  if (values.saleId == null) {
    const lines = (values.lines ?? []).map<SaleLineInput>((line) => ({
      quantity: line.quantity,
      unitPriceCents: line.unitPrice,
      vatRate: line.vatRate,
    }));
    return { lines, saleCustomerId: null };
  }

  // Factura de una venta ya registrada: se leen sus líneas de BD (fuente fiable).
  const { data: sale, error: saleError } = await supabase
    .from("pos_sales")
    .select("id, customer_id")
    .eq("id", values.saleId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (saleError !== null) {
    return { error: `No se pudo leer la venta: ${saleError.message}` };
  }
  if (sale === null) {
    return { error: "La venta indicada no existe o no es accesible" };
  }

  const { data: saleLines, error: linesError } = await supabase
    .from("pos_sale_lines")
    .select("quantity, unit_price_cents, discount_cents, vat_rate")
    .eq("sale_id", values.saleId)
    .eq("salon_id", salonId);
  if (linesError !== null) {
    return { error: `No se pudieron leer las líneas de la venta: ${linesError.message}` };
  }
  if (saleLines === null || saleLines.length === 0) {
    return { error: "La venta no tiene líneas facturables" };
  }

  const lines = saleLines.map<SaleLineInput>((line) => ({
    quantity: line.quantity,
    unitPriceCents: line.unit_price_cents,
    vatRate: line.vat_rate,
    discountCents: line.discount_cents,
  }));
  return { lines, saleCustomerId: sale.customer_id };
}

/**
 * Resuelve el receptor de una factura completa: datos a mano si se envían, o los
 * datos fiscales del cliente fichado (el de la venta, o `customerId`).
 */
async function resolveRecipient(
  supabase: ReturnType<typeof createClient>,
  salonId: string,
  values: InvoiceEmissionValues,
  saleCustomerId: string | null,
): Promise<{ recipient: RecipientData } | { error: string }> {
  if (values.recipient !== undefined) {
    return {
      recipient: {
        taxId: values.recipient.taxId,
        name: values.recipient.name,
        address: values.recipient.address,
      },
    };
  }

  const customerId = values.customerId ?? saleCustomerId;
  if (customerId == null) {
    return { error: "Una factura completa requiere un cliente identificado" };
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("full_name, tax_id, address")
    .eq("id", customerId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (error !== null) {
    return { error: `No se pudieron leer los datos del cliente: ${error.message}` };
  }
  if (customer === null) {
    return { error: "El cliente indicado no existe o no es accesible" };
  }
  if (customer.tax_id == null || customer.tax_id.trim() === "") {
    return {
      error: `El cliente "${customer.full_name}" no tiene NIF/CIF. Complétalo para emitir una factura completa.`,
    };
  }

  return {
    recipient: {
      taxId: customer.tax_id,
      name: customer.full_name,
      address: customer.address,
    },
  };
}

/**
 * Emite una factura Veri*factu (registro inmutable, encadenado y correlativo).
 *
 * Flujo:
 *  1. Valida el payload (Zod) — tipo, serie y origen (venta o líneas libres).
 *  2. Resuelve el salón activo y el snapshot del emisor (datos fiscales del salón).
 *  3. Resuelve las líneas y recalcula los totales/IVA con la capa de pagos
 *     (fuente única; no se confía en importes del cliente).
 *  4. Para 'completa', resuelve el receptor (cliente fichado o datos a mano).
 *  5. Delega en `emitInvoice`, que asigna el nº correlativo sin huecos, encadena
 *     la huella SHA-256 con el registro anterior de la serie y persiste el alta.
 */
export async function emitInvoiceAction(
  input: InvoiceEmissionInput,
): Promise<ActionResult<EmittedInvoice>> {
  const parsed = invoiceEmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  const values = parsed.data;

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();

  // 2) Snapshot del emisor (datos fiscales del salón). Obligatorio para firmar.
  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select("tax_id, legal_name, fiscal_address")
    .eq("id", salonId)
    .maybeSingle();
  if (salonError !== null) {
    return { ok: false, error: `No se pudo leer el emisor: ${salonError.message}` };
  }
  if (salon === null || salon.tax_id == null || salon.legal_name == null) {
    return {
      ok: false,
      error:
        "Faltan los datos fiscales del salón (NIF y razón social). Complétalos en Ajustes › Fiscal antes de facturar.",
    };
  }
  const issuer: IssuerData = {
    taxId: salon.tax_id,
    legalName: salon.legal_name,
    fiscalAddress: salon.fiscal_address,
  };

  // 3) Líneas → totales e IVA (misma aritmética que la caja).
  const resolvedLines = await resolveLineInputs(supabase, salonId, values);
  if ("error" in resolvedLines) {
    return { ok: false, error: resolvedLines.error };
  }
  const totals = computeSaleTotals(resolvedLines.lines);
  if (totals.totalCents <= 0) {
    return { ok: false, error: "El total de la factura debe ser mayor que 0" };
  }

  // 4) Receptor (solo factura completa; el ticket es anónimo).
  let recipient: RecipientData | null = null;
  if (values.invoiceType === "completa") {
    const resolvedRecipient = await resolveRecipient(
      supabase,
      salonId,
      values,
      resolvedLines.saleCustomerId,
    );
    if ("error" in resolvedRecipient) {
      return { ok: false, error: resolvedRecipient.error };
    }
    recipient = resolvedRecipient.recipient;
  }

  // 5) Emisión: numeración correlativa sin huecos + encadenamiento + alta.
  try {
    const invoice = await emitInvoice(supabase, {
      salonId,
      saleId: values.saleId ?? null,
      invoiceType: values.invoiceType,
      series: values.series,
      totals,
      issuer,
      recipient,
    });
    revalidatePath("/tpv");
    return { ok: true, data: invoice };
  } catch (error) {
    if (error instanceof InvoiceEmissionError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo emitir la factura",
    };
  }
}
