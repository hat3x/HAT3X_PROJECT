"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Plus, ShieldPlus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAddCustomerInsurance,
  useCustomerInsurances,
  useInsurers,
  useRemoveCustomerInsurance,
} from "@/hooks/use-insurers";

// ---------------------------------------------------------------------------
// InsuranceCard — tarjeta "Seguro / Mutua" de la ficha del paciente (solo
// sector odontología): lista las aseguradoras asignadas (con nº de póliza) y
// permite añadir/quitar. Mismo molde que `ClinicalRecordCard`, pero el alta
// es un mini-formulario INLINE (patrón `AddPhaseForm` de `plan-workspace.tsx`)
// en vez de un diálogo — solo dos campos, no justifica un modal.
// ---------------------------------------------------------------------------

interface InsuranceCardProps {
  salonId: string;
  customerId: string;
}

export function InsuranceCard({
  salonId,
  customerId,
}: InsuranceCardProps): React.ReactElement {
  const insurancesQuery = useCustomerInsurances(salonId, customerId);
  const insurersQuery = useInsurers(salonId);
  const addMutation = useAddCustomerInsurance(salonId, customerId);
  const removeMutation = useRemoveCustomerInsurance(salonId, customerId);

  const [insurerId, setInsurerId] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const insurances = insurancesQuery.data ?? [];
  // Una aseguradora solo puede asignarse una vez por paciente (UNIQUE
  // customer_id+insurer_id en BD) — se oculta del selector si ya está asignada.
  const assignedInsurerIds = new Set(insurances.map((insurance) => insurance.insurer_id));
  const availableInsurers = (insurersQuery.data ?? []).filter(
    (insurer) => !assignedInsurerIds.has(insurer.id),
  );

  function handleAdd(): void {
    setFormError(null);
    if (insurerId === "") {
      setFormError("Selecciona una aseguradora.");
      return;
    }
    const trimmedPolicy = policyNumber.trim();
    addMutation.mutate(
      {
        customerId,
        insurerId,
        policyNumber: trimmedPolicy === "" ? null : trimmedPolicy,
      },
      {
        onSuccess: () => {
          setInsurerId("");
          setPolicyNumber("");
        },
        onError: (err: unknown) => {
          setFormError(err instanceof Error ? err.message : "Error al añadir el seguro.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Seguro / Mutua
        </CardTitle>
        <CardDescription>Aseguradoras del paciente y nº de póliza.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {insurancesQuery.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : insurancesQuery.isError ? (
          <p className="text-sm text-destructive">
            {insurancesQuery.error instanceof Error
              ? insurancesQuery.error.message
              : "Error al cargar el seguro."}
          </p>
        ) : insurances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin aseguradora asignada todavía.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {insurances.map((insurance) => (
              <li
                key={insurance.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {insurance.insurer?.name ?? "Aseguradora"}
                  </p>
                  {insurance.policy_number !== null && insurance.policy_number !== "" ? (
                    <Badge variant="outline" className="mt-0.5 text-[10px]">
                      Póliza {insurance.policy_number}
                    </Badge>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${insurance.insurer?.name ?? "aseguradora"}`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(insurance.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {availableInsurers.length > 0 ? (
          <div className="grid gap-3 rounded-lg border border-dashed border-border/70 p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="insurance-insurer">Aseguradora</Label>
              <Select value={insurerId} onValueChange={setInsurerId}>
                <SelectTrigger id="insurance-insurer">
                  <SelectValue placeholder="Selecciona una aseguradora" />
                </SelectTrigger>
                <SelectContent>
                  {availableInsurers.map((insurer) => (
                    <SelectItem key={insurer.id} value={insurer.id}>
                      {insurer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="insurance-policy">Nº póliza</Label>
              <Input
                id="insurance-policy"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={addMutation.isPending}
              onClick={handleAdd}
            >
              {addMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Añadir
            </Button>
          </div>
        ) : null}

        {formError !== null ? (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
