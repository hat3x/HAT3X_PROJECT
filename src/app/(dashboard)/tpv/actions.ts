"use server";

import { revalidatePath } from "next/cache";

import { computeCouponDiscountCents } from "@/lib/loyalty/points";
import {
  awardVisit,
  LoyaltyActionError,
  lookupByQr,
  resolveActiveCouponPercentOff,
  type LoyaltyActionErrorCode,
} from "@/lib/loyalty/server";
import type { LoyaltyLookupResult, LoyaltyRewardView } from "@/lib/loyalty/types";
import {
  computeLineTotals,
  computeSaleTotals,
  getPaymentGateway,
  PaymentValidationError,
  prorateDiscountAcrossLines,
  type PaymentTender,
  type SaleLineInput,
} from "@/lib/payments";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import { saleSchema, type SaleInput, type SaleLineValues } from "@/lib/validations/sale";
import type { TablesInsert } from "@/types/database";

/** Resultado tipado de un Server Action de caja. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Fidelización acreditada al cerrar la venta (§sub-6). Se devuelve al cajero para
 * confirmarle en el mismo ticket los puntos ganados, el nuevo saldo y —si la
 * visita alcanzó un hito— la recompensa generada. Es `null` cuando no se escaneó a
 * ningún cliente o cuando la acreditación falló (best-effort: el cobro no se toca).
 */
export interface SaleLoyaltyOutcome {
  /** Puntos sumados en esta venta. */
  pointsEarned: number;
  /** Saldo de puntos resultante del cliente. */
  pointsBalance: number;
  /** Recompensa de hito generada en esta visita, o `null`. */
  reward: LoyaltyRewardView | null;
}

/** Datos devueltos al registrar una venta con éxito. */
export interface SaleReceipt {
  saleId: string;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  /** Descuento total aplicado (cupón incluido), en céntimos. 0 si no hubo. */
  discountCents: number;
  lineCount: number;
  tenderCount: number;
  /**
   * Fidelización acreditada tras el cobro, o `null` si no se escaneó a nadie o la
   * acreditación falló (no bloquea la venta). Ver {@link SaleLoyaltyOutcome}.
   */
  loyalty: SaleLoyaltyOutcome | null;
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/** Una línea validada → entrada de cálculo de la capa de pagos (bruto/IVA). */
function toLineInput(line: SaleLineValues): SaleLineInput {
  return {
    quantity: line.quantity,
    unitPriceCents: line.unitPrice,
    vatRate: line.vatRate,
  };
}

/**
 * Registra una venta de caja ("pasar por caja").
 *
 * Orquesta las tres tablas del TPV usando la capa de pagos como única fuente de
 * totales y de las filas de cobro:
 *
 *  1. Valida el payload (Zod) y recalcula los totales desde las líneas
 *     (`computeSaleTotals`) — NO se confía en totales del cliente.
 *  2. Valida que los tenders cubren EXACTAMENTE el total, vía la pasarela.
 *  3. Inserta la cabecera `pos_sales` (status `completed`).
 *  4. Inserta las líneas `pos_sale_lines` (snapshot de precio/IVA por línea).
 *  5. Inserta los cobros `pos_payments` (una fila por tender = pago mixto).
 *
 * supabase-js no expone transacciones multi-sentencia desde el cliente, así que
 * si un paso posterior falla se COMPENSA borrando la venta (el `on delete
 * cascade` de las FKs arrastra líneas y pagos), evitando ventas a medias.
 */
export async function createSale(input: SaleInput): Promise<ActionResult<SaleReceipt>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  const values = parsed.data;

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return { ok: false, error: "Sesión no válida" };
  }

  // 1) Totales e IVA — fuente única (misma que usa la facturación).
  const lineInputs = values.lines.map(toLineInput);

  // Cupón de bienvenida: el servidor re-resuelve el % AUTORITATIVO (nunca se fía
  // del porcentaje del cliente) y PRORRATEA el descuento entre las líneas, de modo
  // que el total cobrado, la base imponible y el IVA persistidos ya incluyen el
  // descuento —no es un parche visual—. Si el cupón ya no es válido (caducado, ya
  // usado o ajeno), se aborta ANTES de cobrar en vez de cobrar un importe distinto.
  let effectiveLines = lineInputs;
  if (values.coupon != null) {
    let percentOff: number | null;
    try {
      percentOff = await resolveActiveCouponPercentOff(
        values.coupon.id,
        values.coupon.customerId,
      );
    } catch (error) {
      // Fallo de dominio (sesión/permiso): mensaje limpio en vez de reventar.
      if (error instanceof LoyaltyActionError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
    if (percentOff === null) {
      return {
        ok: false,
        error:
          "El cupón de bienvenida ya no es válido. Quítalo del ticket e inténtalo de nuevo.",
      };
    }
    const grossTotalCents = computeSaleTotals(lineInputs).totalCents;
    const discountCents =
      grossTotalCents > 0 ? computeCouponDiscountCents(grossTotalCents, percentOff) : 0;
    effectiveLines = prorateDiscountAcrossLines(lineInputs, discountCents);
  }

  const totals = computeSaleTotals(effectiveLines);
  if (totals.totalCents <= 0) {
    return { ok: false, error: "El total de la venta debe ser mayor que 0" };
  }

  // 2) Preparar el cobro. La pasarela valida que cubre el total (paso 5).
  const tenders: PaymentTender[] = values.tenders.map((tender) => ({
    method: tender.method,
    amountCents: tender.amount,
    paymentMethodId: tender.paymentMethodId ?? null,
    reference: tender.reference ?? null,
  }));

  // Caja abierta del salón (si la hay): la venta y sus cobros cuelgan de ella
  // para que el arqueo (cierre de caja) agregue los totales por método. Sin
  // sesión abierta, la venta se registra igual con `session_id` NULL.
  const { data: openSession, error: openSessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("salon_id", salonId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (openSessionError !== null) {
    return { ok: false, error: openSessionError.message };
  }
  const sessionId = openSession?.id ?? null;

  // 3) Cabecera de la venta.
  const saleInsert: TablesInsert<"pos_sales"> = {
    salon_id: salonId,
    session_id: sessionId,
    appointment_id: values.appointmentId ?? null,
    customer_id: values.customerId ?? null,
    professional_id: values.professionalId ?? null,
    status: "completed",
    subtotal_cents: totals.subtotalCents,
    discount_cents: totals.discountCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    currency: "EUR",
    sold_by: user.id,
    notes: values.notes ?? null,
  };

  const { data: sale, error: saleError } = await supabase
    .from("pos_sales")
    .insert(saleInsert)
    .select("id")
    .single();

  if (saleError !== null || sale === null) {
    return { ok: false, error: saleError?.message ?? "No se pudo crear la venta" };
  }

  const saleId = sale.id;

  // A partir de aquí, cualquier fallo compensa borrando la venta (cascade).
  async function rollback(): Promise<void> {
    await supabase.from("pos_sales").delete().eq("id", saleId).eq("salon_id", salonId!);
  }

  // 4) Líneas del ticket (snapshot de importes por línea). Se usan las líneas
  //    EFECTIVAS (con el descuento del cupón ya prorrateado), así el snapshot por
  //    línea guarda su parte del descuento y `Σ line_total_cents === total_cents`.
  const lineInserts: TablesInsert<"pos_sale_lines">[] = values.lines.map((line, i) => {
    const effective = effectiveLines[i]!;
    const lineTotals = computeLineTotals(effective);
    return {
      salon_id: salonId,
      sale_id: saleId,
      service_id: line.kind === "service" ? line.refId : null,
      product_id: line.kind === "product" ? line.refId : null,
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unitPrice,
      discount_cents: effective.discountCents ?? 0,
      vat_rate: line.vatRate,
      line_total_cents: lineTotals.grossCents,
    };
  });

  const { error: linesError } = await supabase.from("pos_sale_lines").insert(lineInserts);
  if (linesError !== null) {
    await rollback();
    return { ok: false, error: `No se pudieron guardar las líneas: ${linesError.message}` };
  }

  // 5) Cobro vía la capa de pagos → filas de `pos_payments`.
  try {
    const gateway = getPaymentGateway(); // 'manual' (registro, sin cobro real)
    const result = await gateway.registerPayment({
      salonId,
      saleId,
      sessionId,
      totalCents: totals.totalCents,
      tenders,
    });

    const { error: paymentsError } = await supabase
      .from("pos_payments")
      .insert(result.payments);
    if (paymentsError !== null) {
      await rollback();
      return {
        ok: false,
        error: `No se pudo registrar el cobro: ${paymentsError.message}`,
      };
    }
  } catch (error) {
    await rollback();
    if (error instanceof PaymentValidationError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error al registrar el cobro",
    };
  }

  // 6) Fidelización (best-effort, §sub-6). Si se escaneó a un cliente, la visita se
  //    acredita DESPUÉS de que el cobro ya esté firme. La IDEMPOTENCIA la ancla
  //    `ref = { pos_sale, saleId }`: reintentar/duplicar esta venta NO vuelve a
  //    sumar puntos ni a canjear el cupón. Un fallo aquí NUNCA bloquea ni revierte
  //    el cobro —la venta ya está cobrada—; se registra y se devuelve `loyalty:
  //    null`, de modo que la caja se comporta igual que sin fidelización.
  let loyalty: SaleLoyaltyOutcome | null = null;
  const loyaltyCustomerId =
    values.loyaltyCustomerId ?? values.coupon?.customerId ?? null;
  if (loyaltyCustomerId !== null) {
    try {
      const award = await awardVisit({
        salon_id: salonId,
        customer_id: loyaltyCustomerId,
        // Puntos sobre lo REALMENTE cobrado: líneas efectivas (con el descuento del
        // cupón ya prorrateado), coherentes con el `line_total_cents` persistido. La
        // regla por defecto de `awardVisit` es ceil(price_cents / 200) por línea.
        line_items: values.lines.map((line, i) => ({
          price_cents: computeLineTotals(effectiveLines[i]!).grossCents,
          label: line.description,
        })),
        // El cupón se transiciona a USED AQUÍ (createSale solo lo resuelve en
        // lectura para descontar): así el canje y la acreditación van juntos.
        redeem_coupon: values.coupon != null,
        ref: { type: "pos_sale", id: saleId },
      });
      loyalty = {
        pointsEarned: award.points_earned,
        pointsBalance: award.points_balance,
        reward: award.reward,
      };
    } catch (error) {
      // Best-effort: el cobro ya está firme y NO se revierte. Se registra sin volcar
      // datos del cliente (el saldo de puntos es sensible) para poder reconciliar.
      console.error("[tpv/createSale] awardVisit falló; el cobro NO se ve afectado", {
        saleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  revalidatePath("/tpv");
  return {
    ok: true,
    data: {
      saleId,
      totalCents: totals.totalCents,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      discountCents: totals.discountCents,
      lineCount: lineInserts.length,
      tenderCount: tenders.length,
      loyalty,
    },
  };
}

// -----------------------------------------------------------------------------
// Fidelización — lectura del estado de un cliente por su QR (§1.9)
// -----------------------------------------------------------------------------

/**
 * Resultado del lookup de fidelización para el TPV. A diferencia de
 * {@link ActionResult}, la rama de error transporta el `code` de dominio para que
 * el TPV distinga un escaneo "sin resultado" (QR ajeno/inexistente) de un fallo
 * real (sesión caducada, permiso, error interno) y reaccione de forma distinta.
 */
export type LoyaltyLookupActionResult =
  | { ok: true; data: LoyaltyLookupResult }
  | { ok: false; code: LoyaltyActionErrorCode; error: string };

/**
 * Server Action de SOLO LECTURA: resuelve el estado de fidelización (puntos,
 * visitas, cupones y recompensas activas) de un cliente a partir del `qrToken`
 * escaneado en el TPV. Envuelve {@link lookupByQr} de `@/lib/loyalty/server`.
 *
 * ── Seguridad ────────────────────────────────────────────────────────────────
 * La consulta se ejecuta en servidor (`"use server"`). El aislamiento multi-tenant
 * lo garantiza `lookupByQr`, que resuelve el salón activo del usuario por su
 * SESIÓN (`requireActiveSalonId`) y lee con el cliente RLS: un miembro solo ve
 * clientes de SU salón. Para una LECTURA, RLS es más seguro que el service role
 * (no hay que acotar `salon_id` a mano ni exponer una vía que omita RLS); por eso
 * la ruta de escritura sensible usa el cliente admin, pero esta NO. No se crea
 * ningún route handler `/api`: el `SUPABASE_SERVICE_ROLE_KEY` jamás sale a la red.
 *
 * ── Resiliencia (§ "sin romper el TPV") ──────────────────────────────────────
 * NUNCA lanza: cualquier {@link LoyaltyActionError} (o error inesperado) se
 * degrada a un resultado controlado. En particular, `not_found` (QR que no
 * corresponde a ningún cliente del salón) es un desenlace NORMAL del escaneo y se
 * devuelve como `{ ok: false, code: "not_found", error: "Cliente no encontrado" }`,
 * de modo que el TPV muestre un aviso sin caer.
 */
export async function lookupLoyaltyByQr(
  qrToken: string,
): Promise<LoyaltyLookupActionResult> {
  try {
    const data = await lookupByQr(qrToken);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof LoyaltyActionError) {
      // `not_found` recibe un mensaje pensado para el TPV; el resto conserva el
      // mensaje de dominio (401/403/400/500) para que la UI lo muestre tal cual.
      const message =
        error.code === "not_found" ? "Cliente no encontrado" : error.message;
      return { ok: false, code: error.code, error: message };
    }
    // Error NO de dominio: se registra en servidor (sin volcar el qrToken, dato
    // sensible del cliente) y se degrada a un `internal` controlado.
    console.error("[tpv/lookupLoyaltyByQr] error inesperado", error);
    return {
      ok: false,
      code: "internal",
      error: "No se pudo consultar la fidelización.",
    };
  }
}
