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
import {
  retrySaleLoyaltySchema,
  saleSchema,
  type RetrySaleLoyaltyInput,
  type SaleInput,
  type SaleLineValues,
} from "@/lib/validations/sale";
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

/**
 * Ancla de REINTENTO manual de la acreditación (§sub-7). Se devuelve en el recibo
 * SOLO cuando se escaneó a un cliente pero el best-effort de `awardVisit` falló al
 * cerrar el cobro (`loyalty` será entonces `null`). Lleva lo justo para reacreditar
 * sobre la MISMA venta —sin re-cobrar y sin poder duplicar, porque `awardVisit` es
 * idempotente por `ref = { pos_sale, saleId }`—. Ver {@link retrySaleLoyalty}.
 */
export interface SaleLoyaltyRetryRef {
  /** Venta ya cobrada sobre la que reacreditar. */
  saleId: string;
  /** Cliente escaneado al que acreditar la visita. */
  customerId: string;
  /** Si el ticket llevaba cupón: reintentar también su canje. */
  redeemCoupon: boolean;
}

/**
 * Desenlace de un reintento manual. Extiende {@link SaleLoyaltyOutcome} con
 * `alreadyAwarded`, `true` cuando la visita YA constaba acreditada (p. ej. un
 * fallo parcial previo que sí llegó a sumar): en ese caso `pointsEarned` es 0 y
 * `pointsBalance` refleja el saldo ya vigente (nunca se duplica).
 */
export interface RetryLoyaltyOutcome extends SaleLoyaltyOutcome {
  alreadyAwarded: boolean;
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
  /**
   * Ancla de reintento manual, presente SOLO si se escaneó a un cliente pero la
   * acreditación best-effort falló (`loyalty` será `null`). Permite al cajero
   * reacreditar la visita sobre esta venta sin re-cobrar. `null` en el resto de
   * casos (no se escaneó a nadie, o la acreditación fue bien). Ver
   * {@link SaleLoyaltyRetryRef} y {@link retrySaleLoyalty}.
   */
  loyaltyRetry: SaleLoyaltyRetryRef | null;
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
  //
  // Dos caminos. El normal CREA la venta ya cobrada. El otro TERMINA una que ya
  // existe: es el del presupuesto, donde "Pasar a caja" dejó un ticket abierto
  // con sus líneas y la caja lo cierra. Crear una segunda venta en ese caso
  // dejaría la primera huérfana, con la línea del presupuesto colgando de un
  // ticket que nadie iba a cobrar nunca.
  const cabecera = {
    session_id: sessionId,
    appointment_id: values.appointmentId ?? null,
    customer_id: values.customerId ?? null,
    professional_id: values.professionalId ?? null,
    status: "completed" as const,
    subtotal_cents: totals.subtotalCents,
    discount_cents: totals.discountCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    currency: "EUR",
    sold_by: user.id,
    notes: values.notes ?? null,
  };

  let saleId: string;
  /** Cómo deshacer si algo falla después. Depende del camino que se haya tomado. */
  let rollback: () => Promise<void>;

  if (values.saleId != null) {
    // `.eq("status", "open")` no es decoración: es la guarda contra el doble
    // cobro. Si otra persona cobró ese ticket entre que se abrió la pantalla y
    // se pulsó el botón, esta actualización no encuentra fila y se para aquí.
    const { data: actualizada, error: updateError } = await supabase
      .from("pos_sales")
      .update(cabecera)
      .eq("id", values.saleId)
      .eq("salon_id", salonId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (updateError !== null) {
      return { ok: false, error: `No se pudo cerrar el ticket: ${updateError.message}` };
    }
    if (actualizada === null) {
      return {
        ok: false,
        error: "Ese ticket ya no está abierto. Actualiza la pantalla y vuelve a mirarlo.",
      };
    }

    saleId = actualizada.id;
    // Aquí NO se borra: la venta existía antes de este cobro y su línea de
    // presupuesto cuelga de ella. Se devuelve a abierta, como estaba.
    rollback = async () => {
      await supabase
        .from("pos_sales")
        .update({ status: "open" })
        .eq("id", saleId)
        .eq("salon_id", salonId!);
    };
  } else {
    const saleInsert: TablesInsert<"pos_sales"> = { salon_id: salonId, ...cabecera };

    const { data: sale, error: saleError } = await supabase
      .from("pos_sales")
      .insert(saleInsert)
      .select("id")
      .single();

    if (saleError !== null || sale === null) {
      return { ok: false, error: saleError?.message ?? "No se pudo crear la venta" };
    }

    saleId = sale.id;
    // La venta nació en este cobro: si falla, se borra entera (cascade).
    rollback = async () => {
      await supabase.from("pos_sales").delete().eq("id", saleId).eq("salon_id", salonId!);
    };
  }

  // Las líneas se reescriben siempre desde el carrito: el cajero puede haber
  // añadido o quitado conceptos al ticket abierto antes de cobrarlo.
  if (values.saleId != null) {
    const { error: limpiarError } = await supabase
      .from("pos_sale_lines")
      .delete()
      .eq("sale_id", saleId)
      .eq("salon_id", salonId);
    if (limpiarError !== null) {
      await rollback();
      return { ok: false, error: `No se pudieron actualizar las líneas: ${limpiarError.message}` };
    }
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
  let loyaltyRetry: SaleLoyaltyRetryRef | null = null;
  const loyaltyCustomerId =
    values.loyaltyCustomerId ?? values.coupon?.customerId ?? null;
  if (loyaltyCustomerId !== null) {
    // El cupón se transiciona a USED AQUÍ (createSale solo lo resuelve en lectura
    // para descontar): así el canje y la acreditación van juntos. El mismo flag se
    // conserva para un eventual reintento manual.
    const redeemCoupon = values.coupon != null;
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
        redeem_coupon: redeemCoupon,
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
      // Se ofrece al cajero un REINTENTO manual sobre esta misma venta (ref
      // idempotente): reacreditar no re-cobra ni duplica los puntos.
      loyaltyRetry = { saleId, customerId: loyaltyCustomerId, redeemCoupon };
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
      loyaltyRetry,
    },
  };
}

// -----------------------------------------------------------------------------
// Fidelización — reintento manual de la acreditación (§sub-7)
// -----------------------------------------------------------------------------

/**
 * Reacredita la visita de fidelización de una venta YA COBRADA cuando el
 * best-effort de `awardVisit` falló al cerrar el cobro (ver {@link createSale}).
 *
 * Es un REINTENTO manual disparado por el cajero: NO vuelve a cobrar, NO crea otra
 * venta y —crucialmente— NUNCA revierte nada (ni ante un fallo del propio
 * reintento). Los importes se reconstruyen desde las líneas PERSISTIDAS
 * (`pos_sale_lines.line_total_cents`, con el descuento del cupón ya prorrateado),
 * la única fuente autoritativa; el cliente solo aporta a quién acreditar. La
 * idempotencia la ancla `awardVisit` por `ref = { pos_sale, saleId }`: si la venta
 * ya se había acreditado (p. ej. un fallo parcial que sí sumó), el reintento NO
 * duplica y devuelve `alreadyAwarded: true` con `pointsEarned: 0`.
 */
export async function retrySaleLoyalty(
  input: RetrySaleLoyaltyInput,
): Promise<ActionResult<RetryLoyaltyOutcome>> {
  const parsed = retrySaleLoyaltySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  const { saleId, customerId, redeemCoupon } = parsed.data;

  const salonId = await getActiveSalonId();
  if (salonId === null) {
    return { ok: false, error: "No tienes un salón asignado" };
  }

  const supabase = createClient();

  // La venta debe existir en el salón activo: defensa multi-tenant y evita
  // acreditar sobre un `saleId` inventado desde el navegador.
  const { data: sale, error: saleError } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("id", saleId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (saleError !== null) {
    return { ok: false, error: saleError.message };
  }
  if (sale === null) {
    return { ok: false, error: "La venta no existe en este salón." };
  }

  // Líneas persistidas = importes autoritativos (mismo `line_total_cents` que se
  // usó al cerrar, con el cupón ya prorrateado). Reconstruye las MISMAS líneas que
  // la acreditación original, de modo que los puntos coinciden.
  const { data: lines, error: linesError } = await supabase
    .from("pos_sale_lines")
    .select("description, line_total_cents")
    .eq("sale_id", saleId)
    .eq("salon_id", salonId);
  if (linesError !== null) {
    return { ok: false, error: linesError.message };
  }
  if (lines === null || lines.length === 0) {
    return { ok: false, error: "La venta no tiene líneas que acreditar." };
  }

  try {
    const award = await awardVisit({
      salon_id: salonId,
      customer_id: customerId,
      line_items: lines.map((line) => ({
        price_cents: line.line_total_cents,
        label: line.description,
      })),
      redeem_coupon: redeemCoupon,
      ref: { type: "pos_sale", id: saleId },
    });
    return {
      ok: true,
      data: {
        pointsEarned: award.points_earned,
        pointsBalance: award.points_balance,
        reward: award.reward,
        alreadyAwarded: award.already_awarded,
      },
    };
  } catch (error) {
    // El reintento tampoco toca el cobro: la venta queda EXACTAMENTE igual.
    if (error instanceof LoyaltyActionError) {
      return { ok: false, error: error.message };
    }
    console.error("[tpv/retrySaleLoyalty] awardVisit falló en el reintento manual", {
      saleId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: "No se pudieron acreditar los puntos. Inténtalo de nuevo.",
    };
  }
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
