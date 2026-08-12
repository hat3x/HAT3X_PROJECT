"use server";

import { revalidatePath } from "next/cache";

import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  createLabOrderSchema,
  markLabDateSchema,
  type CreateLabOrderInput,
  type MarkLabDateInput,
} from "@/lib/validations/lab-orders";
import type { LabOrder, MemberRole } from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado";
const ERROR_SECTOR = "Esta sección solo está disponible en clínicas dentales";
const ERROR_ROLE = "No tienes permisos para esta acción";

const STAFF_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];
const MANAGER_ROLES: readonly MemberRole[] = ["owner", "manager"];

async function assertLabAccess(
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

/** Crea un pedido a laboratorio (estado inicial: enviado). Owner/manager/staff. */
export async function createLabOrder(
  customerId: string,
  input: CreateLabOrderInput,
): Promise<ActionResult<LabOrder>> {
  const parsed = createLabOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  }

  const access = await assertLabAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("lab_order")
    .insert({
      salon_id: access.salonId,
      customer_id: customerId,
      kind: parsed.data.kind,
      lab_name: parsed.data.labName,
      sent_at: parsed.data.sentAt,
      notes: parsed.data.notes,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data };
}

async function setLabDate(
  orderId: string,
  column: "received_at" | "delivered_at",
  input: MarkLabDateInput,
): Promise<ActionResult<null>> {
  const parsed = markLabDateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Fecha no válida" };
  }
  const access = await assertLabAccess(STAFF_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("lab_order")
    .update({ [column]: parsed.data.date, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}

/** Marca el pedido como recibido en la clínica. Owner/manager/staff. */
export function markLabOrderReceived(orderId: string, input: MarkLabDateInput): Promise<ActionResult<null>> {
  return setLabDate(orderId, "received_at", input);
}

/** Marca el pedido como entregado al paciente. Owner/manager/staff. */
export function markLabOrderDelivered(orderId: string, input: MarkLabDateInput): Promise<ActionResult<null>> {
  return setLabDate(orderId, "delivered_at", input);
}

/** Borra un pedido. Owner/manager. */
export async function deleteLabOrder(orderId: string): Promise<ActionResult<null>> {
  const access = await assertLabAccess(MANAGER_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("lab_order")
    .delete()
    .eq("id", orderId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/ortodoncia");
  return { ok: true, data: null };
}
