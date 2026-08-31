/**
 * Lógica pura de planes de tratamiento / presupuestos (odontología).
 *
 * Espejo conceptual de `perio.ts`: sin IO, solo la máquina de estados de una
 * línea de plan (`plan_item.state`), los roll-ups de totales del plan y el
 * mapeo best-effort servicio → tipo de hallazgo dental (usado por las server
 * actions al materializar un `odontogram_finding` desde un item del plan).
 */
import { formatMoney } from "@/lib/format";
import type { DentalFindingType, PlanItemState, TreatmentPlanStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Máquina de estados de plan_item
// ---------------------------------------------------------------------------

/**
 * Transiciones válidas de `plan_item.state`.
 *
 * propuesto → aceptado | rechazado | anulado
 * aceptado  → en_curso | rechazado | anulado
 * en_curso  → realizado | anulado
 * realizado, rechazado, anulado → sin salida (estados terminales).
 */
export const PLAN_ITEM_TRANSITIONS: Record<PlanItemState, PlanItemState[]> = {
  propuesto: ["aceptado", "rechazado", "anulado"],
  aceptado: ["en_curso", "rechazado", "anulado"],
  en_curso: ["realizado", "anulado"],
  realizado: [],
  rechazado: [],
  anulado: [],
};

/** `true` si la transición `from → to` está permitida por la máquina de estados. */
export function canTransitionItem(from: PlanItemState, to: PlanItemState): boolean {
  return PLAN_ITEM_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Totales del plan
// ---------------------------------------------------------------------------

/** Línea mínima necesaria para calcular los roll-ups de totales de un plan. */
export interface PlanTotalsLine {
  state: PlanItemState;
  line_total_cents: number;
}

/** Roll-ups agregados de un plan de tratamiento, en céntimos. */
export interface PlanTotals {
  /** Σ line_total_cents de items en estado 'propuesto'. */
  proposedCents: number;
  /** Σ line_total_cents de items en 'aceptado' | 'en_curso' | 'realizado'. */
  acceptedCents: number;
  /** Σ line_total_cents de items en 'realizado'. */
  doneCents: number;
  /** Σ line_total_cents de items NO en 'rechazado' | 'anulado'. */
  activeCents: number;
}

/**
 * Calcula los totales de un plan a partir de sus items. Los items
 * `rechazado`/`anulado` no cuentan para ningún total (ni siquiera `activeCents`).
 */
export function computePlanTotals(items: readonly PlanTotalsLine[]): PlanTotals {
  let proposedCents = 0;
  let acceptedCents = 0;
  let doneCents = 0;
  let activeCents = 0;

  for (const item of items) {
    if (item.state === "rechazado" || item.state === "anulado") continue;

    activeCents += item.line_total_cents;

    if (item.state === "propuesto") {
      proposedCents += item.line_total_cents;
    }
    if (item.state === "aceptado" || item.state === "en_curso" || item.state === "realizado") {
      acceptedCents += item.line_total_cents;
    }
    if (item.state === "realizado") {
      doneCents += item.line_total_cents;
    }
  }

  return { proposedCents, acceptedCents, doneCents, activeCents };
}

// ---------------------------------------------------------------------------
// Etiquetas de display (español)
// ---------------------------------------------------------------------------

export const PLAN_ITEM_STATE_LABELS: Record<PlanItemState, string> = {
  propuesto: "Propuesto",
  aceptado: "Aceptado",
  en_curso: "En curso",
  realizado: "Realizado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

/**
 * Estados en los que un plan puede BORRARSE del todo.
 *
 * Borrar arrastra fases y líneas (`on delete cascade`), y con ellas el registro
 * de lo presupuestado y lo ejecutado. Eso solo es inocuo mientras el plan no ha
 * salido del cajón: un borrador a medio escribir o uno ya anulado. En cuanto se
 * propone al paciente, el plan es historia clínica y económica — para eso está
 * anularlo (`cancelled`), que lo retira sin destruir lo que pasó.
 *
 * Vive aquí, y no repartido entre la server action y la pantalla, porque las
 * dos tienen que decir lo mismo: si la interfaz ofrece un botón que el servidor
 * va a rechazar, el usuario se lleva un error en vez de una decisión.
 */
export function canDeletePlan(status: TreatmentPlanStatus): boolean {
  return status === "draft" || status === "cancelled";
}

export const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  draft: "Borrador",
  proposed: "Propuesto",
  accepted: "Aceptado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
};

// ---------------------------------------------------------------------------
// Formato de moneda
// ---------------------------------------------------------------------------

/**
 * Formatea un importe en céntimos a moneda local, p.ej. `formatCents(1250)` →
 * "12,50 €". Reexporta `formatMoney` (@/lib/format) — ya cubre exactamente
 * este caso (Intl.NumberFormat es-ES) y el repo evita duplicar helpers de
 * formato de moneda.
 */
export const formatCents = formatMoney;

// ---------------------------------------------------------------------------
// Mapeo servicio → tipo de hallazgo dental (best-effort)
// ---------------------------------------------------------------------------

/** Datos mínimos de un servicio necesarios para inferir su `DentalFindingType`. */
export interface ServiceFindingSource {
  name?: string | null;
  category?: string | null;
}

/**
 * Orden de comprobación: primer match gana. Las palabras clave están sin
 * acentos (se normaliza `name`/`category` con NFD antes de comparar), así
 * "endodoncia" y "Endodoncia" e.g. con o sin tilde matchean igual.
 */
const FINDING_TYPE_KEYWORDS: ReadonlyArray<{
  type: DentalFindingType;
  keywords: readonly string[];
}> = [
  { type: "caries", keywords: ["caries"] },
  { type: "endodoncia", keywords: ["endodoncia", "conducto"] },
  { type: "corona", keywords: ["corona"] },
  { type: "implante", keywords: ["implante"] },
  { type: "extraccion", keywords: ["extraccion"] },
  { type: "obturacion", keywords: ["obturacion", "empaste"] },
  { type: "blanqueamiento", keywords: ["blanqueamiento"] },
  { type: "sellador", keywords: ["sellador"] },
];

/** Quita acentos y pasa a minúsculas, para un matching de keywords robusto. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Mapeo best-effort de un servicio a un `DentalFindingType`: si el nombre o
 * la categoría del servicio sugieren un procedimiento conocido (caries,
 * endodoncia, corona, implante, extracción, ...) lo usa; si no hay servicio o
 * no matchea ninguna keyword, cae a `'nota'` (tipo neutro/genérico).
 */
export function mapServiceToFindingType(
  service: ServiceFindingSource | null | undefined,
): DentalFindingType {
  if (service == null) return "nota";

  const haystack = normalize(`${service.name ?? ""} ${service.category ?? ""}`);
  for (const { type, keywords } of FINDING_TYPE_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "nota";
}
