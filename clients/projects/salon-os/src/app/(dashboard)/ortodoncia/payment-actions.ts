"use server";

import { revalidatePath } from "next/cache";

import { computeInstallmentSchedule } from "@/lib/dental/ortho-payments";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  createOrthoPlanSchema,
  payInstallmentSchema,
  type CreateOrthoPlanInput,
  type PayInstallmentInput,
} from "@/lib/validations/ortho-payments";
import type { Json, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

const MANAGER_ROLES: readonly MemberRole[] = ["owner", "manager"];
const STAFF_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

async function assertAccess(
  requiredRoles: readonly MemberRole[],
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) return { ok: false, error: ERROR_NO_SALON };
  if (salon.sector !== "odontologia") return { ok: false, error: ERROR_SECTOR };
  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }
  return { ok: true, salonId: salon.id };
}

/** Crea el plan de pago (entrada + cuotas) de forma atómica vía RPC. Owner/manager. */
export async function createOrthoPaymentPlan(
  customerId: string,
  input: CreateOrthoPlanInput,
): Promise<ActionResult<{ planId: string }>> {
  const parsed = createOrthoPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const schedule = computeInstallmentSchedule({
    totalCents: parsed.data.totalCents,
    downPaymentCents: parsed.data.downPaymentCents,
    installmentCount: parsed.data.installmentCount,
    dayOfMonth: parsed.data.dayOfMonth,
    startDate: parsed.data.startDate,
  });

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_ortho_payment_plan", {
    p_salon_id: access.salonId,
    p_customer_id: customerId,
    p_total_cents: parsed.data.totalCents,
    p_down_payment_cents: parsed.data.downPaymentCents,
    p_installment_count: parsed.data.installmentCount,
    p_day_of_month: parsed.data.dayOfMonth,
    p_start_date: parsed.data.startDate,
    p_currency: "EUR",
    p_notes: parsed.data.notes ?? null,
    p_installments: schedule as unknown as Json,
  });

  if (error !== null) {
    // La RPC comprueba "¿ya hay plan activo?" antes de insertar (PLAN_EXISTS),
    // pero dos creaciones concurrentes pueden pasar ambas esa comprobación y
    // chocar después contra el índice único parcial `ortho_payment_plan_one_active`
    // (SQLSTATE 23505; el mensaje de Postgres es el nombre del índice, no "PLAN_EXISTS").
    if (
      error.code === "23505" ||
      error.message.includes("PLAN_EXISTS") ||
      error.message.includes("ortho_payment_plan_one_active")
    ) {
      return { ok: false, error: "Este paciente ya tiene un plan de pago activo" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/ortodoncia");
  return { ok: true, data: { planId: data } };
}

/** Marca una cuota como cobrada (importe completo). Owner/manager/staff. */
export async function payInstallment(
  installmentId: string,
  input: PayInstallmentInput,
): Promise<ActionResult<null>> {
  const parsed = payInstallmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: inst, error: readErr } = await supabase
    .from("ortho_installment")
    .select("id, plan_id, amount_cents")
    .eq("id", installmentId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };
  if (inst === null) return { ok: false, error: "Cuota no encontrada" };

  const { error } = await supabase
    .from("ortho_installment")
    .update({
      status: "pagada",
      paid_at: new Date().toISOString(),
      paid_method: parsed.data.method,
      paid_amount_cents: inst.amount_cents,
    })
    .eq("id", installmentId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  // Si no quedan cuotas pendientes en el plan → marcar el plan como completado.
  const { count } = await supabase
    .from("ortho_installment")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", access.salonId)
    .eq("plan_id", inst.plan_id)
    .eq("status", "pendiente");
  if ((count ?? 0) === 0) {
    await supabase
      .from("ortho_payment_plan")
      .update({ status: "completado", updated_at: new Date().toISOString() })
      .eq("id", inst.plan_id)
      .eq("salon_id", access.salonId);
  }

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Deshace el cobro de una cuota. Owner/manager. Reabre el plan si estaba completado. */
export async function unpayInstallment(installmentId: string): Promise<ActionResult<null>> {
  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { data: inst, error: readErr } = await supabase
    .from("ortho_installment")
    .select("id, plan_id")
    .eq("id", installmentId)
    .eq("salon_id", access.salonId)
    .maybeSingle();
  if (readErr !== null) return { ok: false, error: readErr.message };
  if (inst === null) return { ok: false, error: "Cuota no encontrada" };

  const { error } = await supabase
    .from("ortho_installment")
    .update({ status: "pendiente", paid_at: null, paid_method: null, paid_amount_cents: null })
    .eq("id", installmentId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  await supabase
    .from("ortho_payment_plan")
    .update({ status: "activo", updated_at: new Date().toISOString() })
    .eq("id", inst.plan_id)
    .eq("salon_id", access.salonId)
    .eq("status", "completado");

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Cancela el plan (conserva el histórico de cuotas). Owner/manager. */
export async function cancelOrthoPaymentPlan(planId: string): Promise<ActionResult<null>> {
  const access = await assertAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("ortho_payment_plan")
    .update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("salon_id", access.salonId);
  if (error !== null) return { ok: false, error: error.message };

  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
