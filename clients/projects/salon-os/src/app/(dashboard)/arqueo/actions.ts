"use server";

import { revalidatePath } from "next/cache";

import {
  buildClosingTotals,
  computeCashVariance,
  computeExpectedCash,
  sumAllPayments,
  sumCashPayments,
  type SessionPayment,
} from "@/app/(dashboard)/arqueo/session-totals";
import { getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  closeSessionSchema,
  openSessionSchema,
  type CloseSessionInput,
  type OpenSessionInput,
} from "@/lib/validations/session";
import type { TablesInsert, TablesUpdate } from "@/types/database";

/** Resultado tipado de un Server Action de arqueo. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Datos devueltos al abrir la caja. */
export interface OpenSessionResult {
  sessionId: string;
  openingFloatCents: number;
}

/** Informe de arqueo devuelto al cerrar la caja. */
export interface CloseSessionReceipt {
  sessionId: string;
  openingFloatCents: number;
  /** Total cobrado (todos los métodos) durante la sesión. */
  totalTakingsCents: number;
  /** Efectivo esperado en el cajón = fondo + cobros en efectivo. */
  expectedCashCents: number;
  /** Efectivo realmente contado. */
  countedCashCents: number;
  /** Descuadre = contado − esperado (negativo = falta). */
  cashVarianceCents: number;
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos no válidos";
}

/**
 * Abre una sesión de caja (arqueo del TPV).
 *
 * Registra el fondo inicial y deja la caja `open`. El esquema garantiza como
 * mucho UNA sesión abierta por (salón, sede) con un índice único, pero antes
 * comprobamos si ya hay una abierta para devolver un error legible en vez del
 * de la restricción de BD.
 */
export async function openSession(
  input: OpenSessionInput,
): Promise<ActionResult<OpenSessionResult>> {
  const parsed = openSessionSchema.safeParse(input);
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

  // Ya hay una caja abierta → no se puede abrir otra (una por salón/sede).
  const { data: existing, error: existingError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("salon_id", salonId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (existingError !== null) {
    return { ok: false, error: existingError.message };
  }
  if (existing !== null) {
    return { ok: false, error: "Ya hay una caja abierta. Ciérrala antes de abrir otra." };
  }

  const sessionInsert: TablesInsert<"pos_sessions"> = {
    salon_id: salonId,
    status: "open",
    opened_by: user.id,
    opening_float_cents: values.openingFloat,
    currency: "EUR",
    notes: values.notes ?? null,
  };

  const { data: session, error: insertError } = await supabase
    .from("pos_sessions")
    .insert(sessionInsert)
    .select("id, opening_float_cents")
    .single();

  if (insertError !== null || session === null) {
    return { ok: false, error: insertError?.message ?? "No se pudo abrir la caja" };
  }

  revalidatePath("/arqueo");
  return {
    ok: true,
    data: { sessionId: session.id, openingFloatCents: session.opening_float_cents },
  };
}

/**
 * Cierra una sesión de caja (arqueo).
 *
 * Recalcula EN SERVIDOR los totales por método de los cobros de la sesión
 * (`pos_payments.session_id`) — NO se confía en cifras del cliente —, deriva el
 * efectivo esperado (fondo + efectivo cobrado), el descuadre frente al contado y
 * un snapshot de totales por método, y deja la caja `closed`. El descuadre puede
 * ser negativo (falta dinero en el cajón).
 */
export async function closeSession(
  input: CloseSessionInput,
): Promise<ActionResult<CloseSessionReceipt>> {
  const parsed = closeSessionSchema.safeParse(input);
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

  // La sesión debe existir, pertenecer al salón y seguir abierta.
  const { data: session, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("id, status, opening_float_cents")
    .eq("id", values.sessionId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (sessionError !== null) {
    return { ok: false, error: sessionError.message };
  }
  if (session === null) {
    return { ok: false, error: "La caja no existe" };
  }
  if (session.status !== "open") {
    return { ok: false, error: "La caja ya está cerrada" };
  }

  // Cobros de la sesión → totales por método (fuente de verdad: la BD).
  const { data: paymentRows, error: paymentsError } = await supabase
    .from("pos_payments")
    .select("method, amount_cents")
    .eq("salon_id", salonId)
    .eq("session_id", values.sessionId);
  if (paymentsError !== null) {
    return { ok: false, error: paymentsError.message };
  }
  const payments: SessionPayment[] = paymentRows ?? [];

  const totalTakingsCents = sumAllPayments(payments);
  const expectedCashCents = computeExpectedCash(
    session.opening_float_cents,
    sumCashPayments(payments),
  );
  const cashVarianceCents = computeCashVariance(
    values.countedCash,
    expectedCashCents,
  );

  const closeUpdate: TablesUpdate<"pos_sessions"> = {
    status: "closed",
    closed_by: user.id,
    closed_at: new Date().toISOString(),
    expected_cash_cents: expectedCashCents,
    counted_cash_cents: values.countedCash,
    cash_variance_cents: cashVarianceCents,
    closing_totals: buildClosingTotals(payments),
    notes: values.notes ?? null,
  };

  // Cierre condicionado a que siga abierta (evita doble cierre por carrera).
  const { data: updated, error: updateError } = await supabase
    .from("pos_sessions")
    .update(closeUpdate)
    .eq("id", values.sessionId)
    .eq("salon_id", salonId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (updateError !== null) {
    return { ok: false, error: updateError.message };
  }
  if (updated === null) {
    return { ok: false, error: "La caja ya está cerrada" };
  }

  revalidatePath("/arqueo");
  // Toca también el TPV: la próxima venta ya no colgará de esta sesión.
  revalidatePath("/tpv");

  return {
    ok: true,
    data: {
      sessionId: values.sessionId,
      openingFloatCents: session.opening_float_cents,
      totalTakingsCents,
      expectedCashCents,
      countedCashCents: values.countedCash,
      cashVarianceCents,
    },
  };
}
