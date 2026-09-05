"use client";

import { useState } from "react";
import { AlertCircle, Loader2, ShieldPlus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerInsurances, useSetPlanInsurer } from "@/hooks/use-insurers";

// ---------------------------------------------------------------------------
// PlanInsurerCard — cabecera del plan: muestra la mutua asignada (si hay) y
// un selector para marcarlo con una de las aseguradoras DEL PACIENTE (o "Sin
// mutua"). Solo ofrece las que el paciente ya tiene asignadas
// (`useCustomerInsurances`, misma fuente que `InsuranceCard` en su ficha) —
// coherente con el dominio: un plan no puede cubrirlo una mutua que el
// paciente no tiene contratada.
// ---------------------------------------------------------------------------

/** Valor del `<Select>` para "Sin mutua" — Radix Select no admite value="". */
const NONE_VALUE = "__none__";

export interface PlanInsurerCardProps {
  salonId: string;
  customerId: string;
  planId: string;
  insurerId: string | null;
}

export function PlanInsurerCard({
  salonId,
  customerId,
  planId,
  insurerId,
}: PlanInsurerCardProps): React.ReactElement {
  const customerInsurancesQuery = useCustomerInsurances(salonId, customerId);
  const setInsurerMutation = useSetPlanInsurer(salonId, planId);
  const [error, setError] = useState<string | null>(null);

  const customerInsurances = customerInsurancesQuery.data ?? [];
  const current =
    customerInsurances.find((insurance) => insurance.insurer_id === insurerId) ?? null;

  function handleChange(value: string): void {
    setError(null);
    const nextInsurerId = value === NONE_VALUE ? null : value;
    setInsurerMutation.mutate(nextInsurerId, {
      onError: (err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Error al actualizar la mutua del plan.",
        );
      },
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2 text-sm">
          <ShieldPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-muted-foreground">Mutua del plan:</span>
          <span className="font-medium">
            {current !== null ? (current.insurer?.name ?? "Aseguradora") : "Sin mutua"}
          </span>
        </div>

        {customerInsurancesQuery.isPending ? null : customerInsurances.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            El paciente no tiene ninguna aseguradora asignada.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Label htmlFor="plan-insurer" className="sr-only">
              Mutua del plan
            </Label>
            <Select
              value={insurerId ?? NONE_VALUE}
              onValueChange={handleChange}
              disabled={setInsurerMutation.isPending}
            >
              <SelectTrigger id="plan-insurer" className="w-56">
                {setInsurerMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <SelectValue />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sin mutua</SelectItem>
                {customerInsurances.map((insurance) => (
                  <SelectItem key={insurance.insurer_id} value={insurance.insurer_id}>
                    {insurance.insurer?.name ?? "Aseguradora"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {error !== null ? (
          <p role="alert" className="flex w-full items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
