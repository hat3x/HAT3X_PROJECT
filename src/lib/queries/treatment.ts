import { createClient } from "@/lib/supabase/client";
import type { SaleStatus } from "@/lib/dental/billing";
import type { PlanItem, PlanPhase, TreatmentPlan } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const treatmentKeys = {
  all: (salonId: string) => ["treatment", salonId] as const,
  plans: (salonId: string, customerId: string) =>
    [...treatmentKeys.all(salonId), "plans", customerId] as const,
  plan: (salonId: string, planId: string) =>
    [...treatmentKeys.all(salonId), "plan", planId] as const,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Lista los planes de tratamiento de un paciente, más recientes primero.
 * Acotada por salon_id (multi-tenant) y customer_id.
 */
export async function fetchPlans(
  salonId: string,
  customerId: string,
): Promise<TreatmentPlan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("treatment_plan")
    .select("*")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

/** Detalle completo de un plan: cabecera + fases + items. */
export interface TreatmentPlanDetail {
  plan: TreatmentPlan;
  phases: PlanPhase[];
  items: PlanItem[];
  /**
   * Estado de las ventas que arrastran líneas de este plan, indexado por id de
   * venta. Es lo que permite derivar el estado de COBRO de cada línea sin
   * guardarlo: si un ticket se anula desde la caja, la línea vuelve sola a
   * estar por cobrar (ver `derivePlanItemBilling`).
   */
  sales: Record<string, { status: SaleStatus; hasInvoice: boolean }>;
}

/**
 * Carga un plan de tratamiento completo: la cabecera, las fases
 * (`plan_phase`, por `plan_id`, ordenadas por `position`) y las líneas
 * presupuestadas (`plan_item`, por `plan_id`, ordenadas por `position`).
 * Todas las queries acotadas por `salon_id`. Si el plan no existe (o no
 * pertenece al salón), lanza.
 */
export async function fetchPlan(
  salonId: string,
  planId: string,
): Promise<TreatmentPlanDetail> {
  const supabase = createClient();

  const { data: plan, error: planError } = await supabase
    .from("treatment_plan")
    .select("*")
    .eq("salon_id", salonId)
    .eq("id", planId)
    .single();

  if (planError !== null) throw new Error(planError.message);

  const { data: phases, error: phasesError } = await supabase
    .from("plan_phase")
    .select("*")
    .eq("salon_id", salonId)
    .eq("plan_id", planId)
    .order("position", { ascending: true });

  if (phasesError !== null) throw new Error(phasesError.message);

  const { data: items, error: itemsError } = await supabase
    .from("plan_item")
    .select("*")
    .eq("salon_id", salonId)
    .eq("plan_id", planId)
    .order("position", { ascending: true });

  if (itemsError !== null) throw new Error(itemsError.message);

  // ── Estado de cobro de las líneas ────────────────────────────────────────
  // Solo se consulta si alguna línea ha pasado por caja. En un plan recién
  // hecho —que es el caso normal— esto no añade ni una consulta.
  const saleIds = [...new Set((items ?? []).map((i) => i.pos_sale_id).filter((id): id is string => id !== null))];

  const sales: TreatmentPlanDetail["sales"] = {};
  if (saleIds.length > 0) {
    const { data: ventas, error: ventasError } = await supabase
      .from("pos_sales")
      .select("id, status, pos_invoices(id)")
      .eq("salon_id", salonId)
      .in("id", saleIds);

    if (ventasError !== null) throw new Error(ventasError.message);

    for (const v of ventas ?? []) {
      sales[v.id] = {
        status: v.status as SaleStatus,
        // `pos_invoices` llega como array por la relación: una venta puede
        // tener factura o no. Con una basta para decir "cobrado con factura".
        hasInvoice: Array.isArray(v.pos_invoices) && v.pos_invoices.length > 0,
      };
    }
  }

  return { plan, phases: phases ?? [], items: items ?? [], sales };
}

// ---------------------------------------------------------------------------
// Helper puro — agrupación de items por fase
// ---------------------------------------------------------------------------

/**
 * Agrupa un array plano de `plan_item` por `phase_id`. Los items sin fase
 * (`phase_id === null`) se agrupan bajo la clave `null` ("sin fase").
 */
export function groupItemsByPhase(
  items: readonly PlanItem[],
): Map<string | null, PlanItem[]> {
  const map = new Map<string | null, PlanItem[]>();
  for (const item of items) {
    const key = item.phase_id;
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, [item]);
    } else {
      existing.push(item);
    }
  }
  return map;
}
