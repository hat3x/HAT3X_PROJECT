"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useServices } from "@/hooks/use-services";
import { useToothBudget } from "@/hooks/use-treatment";
import {
  BILLING_STATE_LABELS,
  derivePlanItemBilling,
  type BillingState,
} from "@/lib/dental/billing";
import { PLAN_ITEM_STATE_LABELS, formatCents } from "@/lib/dental/treatment";
import type { PlanItem } from "@/types/database";

// ---------------------------------------------------------------------------
// ToothBudgetCard — lo presupuestado en UN diente, junto al hallazgo.
//
// ── POR QUÉ AQUÍ Y NO EN LA PANTALLA DE PLANES ──────────────────────────────
// El odontograma es donde el dentista mira, y la pregunta que se hace delante
// del paciente es "en este diente, ¿qué le habíamos presupuestado y qué falta
// por cobrar?". Contestarla obligaba a abrir Planes, buscar cuál de ellos toca
// ese diente y leer sus líneas. Ahora sale al pulsar el diente.
//
// Cruza TODOS los planes del paciente a propósito: un molar puede arrastrar la
// endodoncia de un plan de marzo y la corona de otro de septiembre, y en la
// boca es el mismo diente.
// ---------------------------------------------------------------------------

export interface ToothBudgetCardProps {
  salonId: string;
  /** `clinical_record_id`, que es el `customer_id` del paciente. */
  clinicalRecordId: string;
  /** Diente en notación FDI. */
  fdi: number;
  /** Moneda del salón; los planes la llevan por plan, aquí basta una. */
  currency?: string;
}

const BILLING_BADGE_VARIANT: Record<BillingState, "outline" | "secondary" | "default" | "destructive"> = {
  sin_pasar: "outline",
  pendiente_cobro: "secondary",
  cobrado_sin_factura: "default",
  cobrado_con_factura: "default",
  devuelto: "destructive",
};

export function ToothBudgetCard({
  salonId,
  clinicalRecordId,
  fdi,
  currency = "EUR",
}: ToothBudgetCardProps): React.ReactElement | null {
  const budget = useToothBudget(salonId, clinicalRecordId);
  const servicesQuery = useServices(salonId, "");

  if (budget.isPending) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Presupuestado en el {fdi}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (budget.isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Presupuestado en el {fdi}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-destructive">
          No se pudo cargar el presupuesto de este diente.
        </CardContent>
      </Card>
    );
  }

  const { items, sales } = budget.data ?? { items: [], sales: {} };
  const delDiente = items.filter((item) => item.fdi_code === fdi);

  // Un diente sin nada presupuestado no merece una tarjeta vacía: el panel de
  // hallazgos ya ocupa esa columna y esto sería ruido en la mayoría de dientes.
  if (delDiente.length === 0) return null;

  const servicesById = new Map((servicesQuery.data ?? []).map((s) => [s.id, s]));

  function billingOf(item: PlanItem): BillingState {
    const sale = item.pos_sale_id === null ? undefined : sales[item.pos_sale_id];
    return derivePlanItemBilling({
      posSaleId: item.pos_sale_id,
      saleStatus: sale?.status ?? null,
      hasInvoice: sale?.hasInvoice ?? false,
      lineTotalCents: item.line_total_cents,
    });
  }

  const totalCents = delDiente.reduce((suma, item) => suma + item.line_total_cents, 0);
  const porCobrarCents = delDiente
    .filter((item) => billingOf(item) === "sin_pasar")
    .reduce((suma, item) => suma + item.line_total_cents, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>Presupuestado en el {fdi}</span>
          <span className="text-base font-semibold tabular-nums">
            {formatCents(totalCents, currency)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-0">
        <ul className="divide-y">
          {delDiente.map((item) => {
            const service = item.service_id !== null ? servicesById.get(item.service_id) : undefined;
            const title = service?.name ?? item.description ?? "Sin descripción";
            const billing = billingOf(item);

            return (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>x{item.quantity}</span>
                    <span className="font-medium text-foreground">
                      {formatCents(item.line_total_cents, currency)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {PLAN_ITEM_STATE_LABELS[item.state]}
                  </Badge>
                  {/* "Sin pasar a caja" es el caso por defecto: enseñarlo en
                      cada línea sería ruido. Solo se marca lo que ya se movió. */}
                  {billing !== "sin_pasar" && (
                    <Badge variant={BILLING_BADGE_VARIANT[billing]} className="text-[10px]">
                      {BILLING_STATE_LABELS[billing]}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {porCobrarCents > 0 && (
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            {formatCents(porCobrarCents, currency)} sin pasar a caja. El cobro se hace desde el
            plan de tratamiento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
