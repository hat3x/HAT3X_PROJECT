"use server";

import { addOdontogramFinding } from "@/app/(dashboard)/odontograma/actions";
import { canTransitionItem, mapServiceToFindingType } from "@/lib/dental/treatment";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import type {
  MemberRole,
  OdontogramFindingInsert,
  PlanItem,
  PlanItemInsert,
  PlanItemState,
  PlanPhase,
  PlanPhaseInsert,
  TreatmentPlan,
  TreatmentPlanInsert,
  TreatmentPlanStatus,
} from "@/types/database";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ERROR_NO_SALON = "No tienes un salón asignado.";
const ERROR_SECTOR =
  "Los planes de tratamiento solo están disponibles para salones del sector odontología.";
const ERROR_ROLE = "No tienes permiso para escribir en los planes de tratamiento.";

/** Roles con permiso de escritura general (crear/añadir/transicionar) UNA VEZ pasado el gate de sector. */
const WRITE_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

/** Roles con permiso de borrado (items y planes). `staff` queda excluido. */
const DELETE_ROLES: readonly MemberRole[] = ["owner", "manager"];

type SupabaseServerClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Gate — defensa en profundidad (sector + rol), igual que periodontograma/actions.ts
// ---------------------------------------------------------------------------

/**
 * Gate explícito en servidor, ADICIONAL a RLS: solo salones de sector
 * "odontologia" y solo miembros con el rol requerido pueden escribir en los
 * planes de tratamiento. Espeja `assertPerioWriteAccess` de
 * `periodontograma/actions.ts` — la política RLS `plan_*_rw` acota por
 * `salon_id` pero no comprueba el sector del salón, así que sin este gate un
 * owner/manager de un salón de peluquería podría escribir planes vía Server
 * Action directa.
 */
async function assertPlanAccess(
  requiredRoles: readonly MemberRole[] = WRITE_ROLES,
): Promise<{ ok: true; salonId: string } | { ok: false; error: string }> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return { ok: false, error: ERROR_NO_SALON };
  }
  if (salon.sector !== "odontologia") {
    return { ok: false, error: ERROR_SECTOR };
  }

  const membership = await getActiveMembership();
  if (membership === null || !requiredRoles.includes(membership.role)) {
    return { ok: false, error: ERROR_ROLE };
  }

  return { ok: true, salonId: salon.id };
}

// ---------------------------------------------------------------------------
// Helper interno — mapeo best-effort servicio → finding_type
// ---------------------------------------------------------------------------

/**
 * Resuelve el `DentalFindingType` a usar al materializar un `odontogram_finding`
 * a partir de un `service_id` (o `'nota'` si no hay servicio o no se encuentra).
 * Compartido por `addPlanItem` (al proponer) y `transitionPlanItem` (al marcar
 * `realizado`), para que ambos hallazgos del mismo item usen el mismo tipo.
 */
async function resolveFindingTypeForService(
  supabase: SupabaseServerClient,
  salonId: string,
  serviceId: string | null,
) {
  if (serviceId === null) return mapServiceToFindingType(null);

  const { data, error } = await supabase
    .from("services")
    .select("name, category")
    .eq("id", serviceId)
    .eq("salon_id", salonId)
    .single();

  if (error !== null || data === null) return mapServiceToFindingType(null);
  return mapServiceToFindingType(data);
}

// ---------------------------------------------------------------------------
// createPlan
// ---------------------------------------------------------------------------

export interface CreatePlanInput {
  customerId: string;
  notes?: string | null;
}

/** Crea la cabecera de un nuevo plan de tratamiento (borrador), acotado al salón activo. */
export async function createPlan(input: CreatePlanInput): Promise<ActionResult<TreatmentPlan>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payload: TreatmentPlanInsert = {
    salon_id: access.salonId,
    customer_id: input.customerId,
    notes: input.notes ?? null,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("treatment_plan")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// addPlanPhase
// ---------------------------------------------------------------------------

export interface AddPlanPhaseInput {
  planId: string;
  name: string;
  priority?: number;
}

/** Añade una fase a un plan existente, acotada al salón activo. */
export async function addPlanPhase(input: AddPlanPhaseInput): Promise<ActionResult<PlanPhase>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const payload: PlanPhaseInsert = {
    salon_id: access.salonId,
    plan_id: input.planId,
    name: input.name,
    priority: input.priority ?? 0,
  };

  const { data, error } = await supabase
    .from("plan_phase")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// addPlanItem
// ---------------------------------------------------------------------------

export interface AddPlanItemInput {
  planId: string;
  phaseId?: string | null;
  serviceId?: string | null;
  description?: string | null;
  fdiCode?: number | null;
  surfaces?: string[];
  quantity?: number;
  unitPriceCents: number;
  discountCents?: number;
  taxRate?: number;
}

/**
 * Añade una línea presupuestada (estado inicial `'propuesto'`) a un plan.
 *
 * Enlace odontograma: si `fdiCode` viene informado, materializa un
 * `odontogram_finding` (`tooth_state='pendiente'`, rojo) para ese diente,
 * usando `clinical_record_id = customer_id` del plan (resuelto vía
 * `treatment_plan`) y un `finding_type` best-effort a partir del servicio
 * (`mapServiceToFindingType`); guarda el `finding_id` resultante en el item.
 */
export async function addPlanItem(input: AddPlanItemInput): Promise<ActionResult<PlanItem>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  // customer_id del plan — necesario para materializar el finding del odontograma.
  const { data: plan, error: planError } = await supabase
    .from("treatment_plan")
    .select("customer_id")
    .eq("id", input.planId)
    .eq("salon_id", access.salonId)
    .single();

  if (planError !== null) return { ok: false, error: planError.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const serviceId = input.serviceId ?? null;
  const surfaces = input.surfaces ?? [];
  let findingId: string | null = null;

  if (input.fdiCode != null) {
    const findingType = await resolveFindingTypeForService(supabase, access.salonId, serviceId);

    const findingPayload: OdontogramFindingInsert = {
      clinical_record_id: plan.customer_id,
      salon_id: access.salonId,
      fdi_tooth: input.fdiCode,
      surfaces,
      finding_type: findingType,
      tooth_state: "pendiente",
      recorded_by: user?.id ?? null,
    };

    const findingResult = await addOdontogramFinding(findingPayload);
    if (!findingResult.ok) return { ok: false, error: findingResult.error };
    findingId = findingResult.data.id;
  }

  const payload: PlanItemInsert = {
    salon_id: access.salonId,
    plan_id: input.planId,
    phase_id: input.phaseId ?? null,
    service_id: serviceId,
    description: input.description ?? null,
    fdi_code: input.fdiCode ?? null,
    surfaces,
    quantity: input.quantity ?? 1,
    unit_price_cents: input.unitPriceCents,
    discount_cents: input.discountCents ?? 0,
    tax_rate: input.taxRate ?? 0,
    state: "propuesto",
    finding_id: findingId,
  };

  const { data, error } = await supabase
    .from("plan_item")
    .insert(payload)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// transitionPlanItem
// ---------------------------------------------------------------------------

/**
 * Transiciona el estado de una línea del plan, validando la máquina de
 * estados (`canTransitionItem`). Al pasar a `'realizado'`, además de marcar
 * `executed_at`/`executed_by`, materializa un `odontogram_finding`
 * `tooth_state='hecho'` (azul) para el diente del item (si tiene `fdi_code`).
 *
 * NOTA sobre `updated_at`: a diferencia de `perio_exam` (que tiene el trigger
 * `trg_perio_exam_updated_at`), la migración de `plan_item` no da de alta un
 * trigger `app.set_updated_at()` — así que esta acción lo establece a mano en
 * cada UPDATE para que la columna siga siendo significativa.
 */
export async function transitionPlanItem(
  itemId: string,
  toState: PlanItemState,
): Promise<ActionResult<PlanItem>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("plan_item")
    .select("*")
    .eq("id", itemId)
    .eq("salon_id", access.salonId)
    .single();

  if (fetchError !== null) return { ok: false, error: fetchError.message };

  if (!canTransitionItem(existing.state, toState)) {
    return {
      ok: false,
      error: `Transición no permitida: ${existing.state} → ${toState}.`,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date().toISOString();
  const update: {
    state: PlanItemState;
    updated_at: string;
    executed_at?: string;
    executed_by?: string | null;
  } = { state: toState, updated_at: now };

  if (toState === "realizado") {
    update.executed_at = now;
    update.executed_by = user?.id ?? null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("plan_item")
    .update(update)
    .eq("id", itemId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (updateError !== null) return { ok: false, error: updateError.message };

  if (toState === "realizado" && updated.fdi_code !== null) {
    const { data: plan, error: planError } = await supabase
      .from("treatment_plan")
      .select("customer_id")
      .eq("id", updated.plan_id)
      .eq("salon_id", access.salonId)
      .single();

    if (planError !== null) return { ok: false, error: planError.message };

    const findingType = await resolveFindingTypeForService(
      supabase,
      access.salonId,
      updated.service_id,
    );

    const findingPayload: OdontogramFindingInsert = {
      clinical_record_id: plan.customer_id,
      salon_id: access.salonId,
      fdi_tooth: updated.fdi_code,
      surfaces: updated.surfaces,
      finding_type: findingType,
      tooth_state: "hecho",
      recorded_by: user?.id ?? null,
    };

    const findingResult = await addOdontogramFinding(findingPayload);
    if (!findingResult.ok) return { ok: false, error: findingResult.error };
  }

  return { ok: true, data: updated };
}

// ---------------------------------------------------------------------------
// deletePlanItem / deletePlan (owner/manager)
// ---------------------------------------------------------------------------

/** Elimina una línea del plan. Requiere rol owner/manager. */
export async function deletePlanItem(itemId: string): Promise<ActionResult<{ id: string }>> {
  const access = await assertPlanAccess(DELETE_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("plan_item")
    .delete()
    .eq("id", itemId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data: { id: itemId } };
}

/** Elimina un plan completo (cascada a fases/items vía FK ON DELETE CASCADE). Requiere rol owner/manager. */
export async function deletePlan(planId: string): Promise<ActionResult<{ id: string }>> {
  const access = await assertPlanAccess(DELETE_ROLES);
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("treatment_plan")
    .delete()
    .eq("id", planId)
    .eq("salon_id", access.salonId);

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data: { id: planId } };
}

// ---------------------------------------------------------------------------
// updatePlanStatus
// ---------------------------------------------------------------------------

/** Actualiza el estado (roll-up) del plan. */
export async function updatePlanStatus(
  planId: string,
  status: TreatmentPlanStatus,
): Promise<ActionResult<TreatmentPlan>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("treatment_plan")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
}
