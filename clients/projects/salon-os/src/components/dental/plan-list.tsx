"use client";

import { ClipboardList, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canDeletePlan, PLAN_STATUS_LABELS } from "@/lib/dental/treatment";
import { formatDateTime } from "@/lib/format";
import type { TreatmentPlan, TreatmentPlanStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// PlanList — lista de planes de tratamiento de un paciente
// ---------------------------------------------------------------------------

export interface PlanListProps {
  plans: readonly TreatmentPlan[];
  onSelect: (planId: string) => void;
  selectedId?: string;
  /**
   * Borrar un plan. Opcional a propósito: quien no tiene permiso (todo lo que
   * no sea owner/manager) no recibe el callback y no ve el botón, en vez de
   * verlo y llevarse un error del servidor al pulsarlo.
   */
  onDelete?: (planId: string) => void;
  /** Plan cuyo borrado está en vuelo, para desactivar solo ese botón. */
  deletingId?: string | null;
}

/** Variante de `Badge` por estado del plan (roll-up gestionado por la app). */
const STATUS_BADGE_VARIANT: Record<
  TreatmentPlanStatus,
  "default" | "outline" | "secondary" | "destructive"
> = {
  draft: "outline",
  proposed: "secondary",
  accepted: "default",
  in_progress: "default",
  completed: "secondary",
  cancelled: "destructive",
};

/**
 * Lista los planes de tratamiento de un paciente, más recientes primero (se
 * reordena aquí por defensa: no asume el orden del caller, aunque
 * `fetchPlans` ya los trae ordenados). Cada fila es un botón real (accesible
 * por teclado) que llama `onSelect(planId)`. Espejo estructural de
 * `PerioHistory`.
 */
export function PlanList({
  plans,
  onSelect,
  selectedId,
  onDelete,
  deletingId,
}: PlanListProps): React.ReactElement {
  const sorted = [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <ClipboardList className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Planes de tratamiento
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin planes de tratamiento
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((plan) => {
              const isSelected = selectedId === plan.id;
              const hasNotes = plan.notes !== null && plan.notes.trim() !== "";
                // Borrar arrastra fases y líneas en cascada, así que el botón
                // solo aparece donde eso no destruye nada (`canDeletePlan`).
                const isDeletable = onDelete !== undefined && canDeletePlan(plan.status);
                const isDeleting = deletingId === plan.id;
                return (
                  // El botón de borrar va como HERMANO del de seleccionar, no
                  // dentro: un <button> anidado en otro no es HTML válido y el
                  // click acabaría seleccionando el plan además de borrarlo.
                  <li
                    key={plan.id}
                    className={[
                      "flex items-stretch",
                      isSelected ? "bg-accent/60" : "",
                    ].join(" ")}
                  >
                  <button
                    type="button"
                    onClick={() => onSelect(plan.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={[
                      "flex min-w-0 flex-1 items-start justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      isSelected ? "font-medium" : "",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p>{formatDateTime(plan.created_at)}</p>
                      {hasNotes && (
                        <p className="truncate text-xs text-muted-foreground">{plan.notes}</p>
                      )}
                    </div>
                    <Badge
                      variant={STATUS_BADGE_VARIANT[plan.status]}
                      className="shrink-0 text-[10px]"
                    >
                      {PLAN_STATUS_LABELS[plan.status]}
                    </Badge>
                  </button>

                    {isDeletable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar plan"
                        disabled={isDeleting}
                        onClick={() => onDelete(plan.id)}
                        className="my-1 mr-2 shrink-0 self-center"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        )}
                      </Button>
                    )}
                  </li>
                );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
