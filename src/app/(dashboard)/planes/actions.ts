"use server";

import { addOdontogramFinding } from "@/app/(dashboard)/odontograma/actions";
import { canTransitionItem, mapServiceToFindingType } from "@/lib/dental/treatment";
import { getActiveMembership, getActiveSalon } from "@/lib/salon";
import { applyMovement, movementDelta } from "@/lib/stock";
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
// consumeServiceMaterials — auto-descuento de stock (escandallo)
// ---------------------------------------------------------------------------

/**
 * Descuenta el stock de los materiales del escandallo (`service_material`)
 * de un servicio, tras marcar una línea de plan (`plan_item`) como
 * `'realizado'`. Por cada material registra un `stock_movement` de tipo
 * `'salida'` con `quantity = material.quantity * itemQuantity`, reutilizando
 * `applyMovement`/`movementDelta` de `@/lib/stock` (mismo cálculo puro que
 * `products/stock-actions.ts`).
 *
 * Si el stock disponible no alcanza para el consumo completo, se descuenta
 * SOLO hasta 0 (clamp) — nunca se rechaza ni se deja el stock en negativo,
 * a diferencia de `recordStockMovement` (que si rechaza la `salida`). Un
 * producto sin control de stock (`stock === null`) se trata como 0: al no
 * haber nada que descontar, no se registra movimiento para esa línea.
 *
 * BEST-EFFORT por diseño: el caller (`transitionPlanItem`) la envuelve en un
 * `try/catch` y nunca deja que un fallo aquí tumbe la transición ya
 * confirmada — marcar un tratamiento como realizado NUNCA debe fallar por el
 * stock. Cualquier error de BD (fetch de materiales, insert del movimiento,
 * update de `products.stock`) se propaga como excepción para que el caller
 * lo capture y lo registre con `console.error`.
 */
async function consumeServiceMaterials(
  supabase: SupabaseServerClient,
  salonId: string,
  serviceId: string,
  itemQuantity: number,
  userId: string | null,
): Promise<void> {
  const { data: materials, error: materialsError } = await supabase
    .from("service_material")
    .select("product_id, quantity")
    .eq("salon_id", salonId)
    .eq("service_id", serviceId);

  if (materialsError !== null) throw new Error(materialsError.message);
  if (materials === null || materials.length === 0) return;

  for (const material of materials) {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, stock")
      .eq("id", material.product_id)
      .eq("salon_id", salonId)
      .single();

    if (productError !== null || product === null) {
      throw new Error(productError?.message ?? "Producto del escandallo no encontrado.");
    }

    const currentStock = product.stock ?? 0;
    const requestedQty = material.quantity * itemQuantity;
    // Clamp: nunca se consume más de lo disponible (nunca queda negativo).
    const consumedQty = Math.min(requestedQty, Math.max(currentStock, 0));
    if (consumedQty <= 0) continue;

    const delta = movementDelta(currentStock, "salida", consumedQty);
    const newStock = applyMovement(currentStock, "salida", consumedQty);

    const { error: insertError } = await supabase.from("stock_movement").insert({
      salon_id: salonId,
      product_id: material.product_id,
      kind: "salida",
      quantity: delta,
      resulting_stock: newStock,
      note: "Consumo automático — tratamiento realizado",
      created_by: userId,
    });

    if (insertError !== null) throw new Error(insertError.message);

    const { error: updateStockError } = await supabase
      .from("products")
      .update({ stock: newStock })
      .eq("id", material.product_id)
      .eq("salon_id", salonId);

    if (updateStockError !== null) throw new Error(updateStockError.message);
  }
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

  // Auto-descuento de stock (escandallo) — best-effort: un fallo aquí NUNCA
  // debe tumbar una transición ya confirmada en BD. Ver `consumeServiceMaterials`.
  if (toState === "realizado" && updated.service_id !== null) {
    try {
      await consumeServiceMaterials(
        supabase,
        access.salonId,
        updated.service_id,
        updated.quantity,
        user?.id ?? null,
      );
    } catch (err) {
      console.error(
        "Consumo automático de materiales (service_material) falló tras marcar el item como realizado:",
        err,
      );
    }
  }

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
// setPlanInsurer — marca (o desmarca) el plan como cubierto por una mutua
// ---------------------------------------------------------------------------

/**
 * Marca un plan de tratamiento con una aseguradora (`insurer_id`), o lo
 * desmarca si se pasa `null`. Reutiliza {@link assertPlanAccess} (mismo gate
 * que el resto de este archivo) en vez de duplicarlo en
 * `ajustes/mutuas/actions.ts` — este endpoint vive junto al resto de las
 * escrituras de `treatment_plan`.
 */
export async function setPlanInsurer(
  planId: string,
  insurerId: string | null,
): Promise<ActionResult<TreatmentPlan>> {
  const access = await assertPlanAccess();
  if (!access.ok) return { ok: false, error: access.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("treatment_plan")
    .update({ insurer_id: insurerId, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("salon_id", access.salonId)
    .select()
    .single();

  if (error !== null) return { ok: false, error: error.message };
  return { ok: true, data };
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
