"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServices } from "@/hooks/use-services";
import { useDeletePlanItem, useTransitionPlanItem } from "@/hooks/use-treatment";
import {
  PLAN_ITEM_STATE_LABELS,
  canTransitionItem,
  computePlanTotals,
  formatCents,
} from "@/lib/dental/treatment";
import { groupItemsByPhase } from "@/lib/queries/treatment";
import type { PlanItem, PlanItemState, PlanPhase, TreatmentPlan } from "@/types/database";

// ---------------------------------------------------------------------------
// PlanDetail — detalle de un plan: presupuesto + fases + items con controles
// de estado. Componente CLIENTE: llama directamente a los hooks de mutación
// de `use-treatment.ts` (cada fila necesita su propio botón de transición, así
// que el acoplamiento vive aquí en vez de subir por callbacks).
// ---------------------------------------------------------------------------

export interface PlanDetailProps {
  salonId: string;
  plan: TreatmentPlan;
  phases: readonly PlanPhase[];
  items: readonly PlanItem[];
}

/** Etiqueta del botón de acción para transicionar a un estado destino dado. */
const TRANSITION_ACTION_LABELS: Record<PlanItemState, string> = {
  propuesto: "Proponer",
  aceptado: "Aceptar",
  en_curso: "Iniciar",
  realizado: "Marcar realizado",
  rechazado: "Rechazar",
  anulado: "Anular",
};

/** Estados destino cuya acción es "negativa" (se muestran en variante destructiva). */
const NEGATIVE_TARGETS: ReadonlySet<PlanItemState> = new Set(["rechazado", "anulado"]);

const ALL_ITEM_STATES: readonly PlanItemState[] = [
  "propuesto",
  "aceptado",
  "en_curso",
  "realizado",
  "rechazado",
  "anulado",
];

export function PlanDetail({
  salonId,
  plan,
  phases,
  items,
}: PlanDetailProps): React.ReactElement {
  const transitionMutation = useTransitionPlanItem(salonId, plan.id);
  const deleteMutation = useDeletePlanItem(salonId, plan.id);
  const servicesQuery = useServices(salonId, "");
  const [actionError, setActionError] = useState<string | null>(null);

  const servicesById = new Map((servicesQuery.data ?? []).map((s) => [s.id, s]));
  const grouped = groupItemsByPhase(items);
  const totals = computePlanTotals(items);

  function handleTransition(itemId: string, toState: PlanItemState) {
    setActionError(null);
    transitionMutation.mutate(
      { itemId, toState },
      {
        onError: (err: unknown) => {
          setActionError(err instanceof Error ? err.message : "Error al cambiar el estado.");
        },
      },
    );
  }

  function handleDelete(itemId: string) {
    setActionError(null);
    deleteMutation.mutate(itemId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al eliminar el item.");
      },
    });
  }

  // Grupos en el orden de `phases` (ya viene ordenado por `position`), y al
  // final "Sin fase" si hay items sin fase asignada.
  const phaseGroups: { key: string; name: string; items: PlanItem[] }[] = phases.map((phase) => ({
    key: phase.id,
    name: phase.name,
    items: grouped.get(phase.id) ?? [],
  }));
  const unphased = grouped.get(null) ?? [];
  if (unphased.length > 0) {
    phaseGroups.push({ key: "sin-fase", name: "Sin fase", items: unphased });
  }

  return (
    <div className="space-y-4">
      {/* Presupuesto */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Presupuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-3">
            <BudgetStat
              label="Presupuesto total"
              value={formatCents(totals.activeCents, plan.currency)}
            />
            <BudgetStat
              label="Aceptado"
              value={formatCents(totals.acceptedCents, plan.currency)}
            />
            <BudgetStat label="Realizado" value={formatCents(totals.doneCents, plan.currency)} />
          </dl>
        </CardContent>
      </Card>

      {actionError !== null && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {/* Fases + items */}
      {phaseGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sin líneas presupuestadas todavía.
          </CardContent>
        </Card>
      ) : (
        phaseGroups.map((group) => (
          <Card key={group.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{group.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {group.items.length === 0 ? (
                <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                  Sin líneas en esta fase.
                </p>
              ) : (
                <ul className="divide-y">
                  {group.items.map((item) => {
                    const service = item.service_id !== null ? servicesById.get(item.service_id) : undefined;
                    const title = service?.name ?? item.description ?? "Sin descripción";
                    const nextStates = ALL_ITEM_STATES.filter((to) =>
                      canTransitionItem(item.state, to),
                    );

                    return (
                      <li key={item.id} className="space-y-2 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-medium">{title}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {item.fdi_code !== null && <span>Diente {item.fdi_code}</span>}
                              <span>x{item.quantity}</span>
                              <span>{formatCents(item.unit_price_cents, plan.currency)}/ud</span>
                              <span className="font-medium text-foreground">
                                {formatCents(item.line_total_cents, plan.currency)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {PLAN_ITEM_STATE_LABELS[item.state]}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Eliminar línea"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(item.id)}
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {nextStates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {nextStates.map((toState) => (
                              <Button
                                key={toState}
                                type="button"
                                size="sm"
                                variant={NEGATIVE_TARGETS.has(toState) ? "outline" : "default"}
                                disabled={transitionMutation.isPending}
                                onClick={() => handleTransition(item.id, toState)}
                              >
                                {TRANSITION_ACTION_LABELS[toState]}
                              </Button>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente
// ---------------------------------------------------------------------------

function BudgetStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
