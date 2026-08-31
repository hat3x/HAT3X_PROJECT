"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Plus,
  PlusCircle,
} from "lucide-react";

import { addPlanPhase, type AddPlanPhaseInput } from "@/app/(dashboard)/planes/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServices } from "@/hooks/use-services";
import {
  useAddPlanItem,
  useCreatePlan,
  usePlan,
  useDeletePlan,
  usePlans,
} from "@/hooks/use-treatment";
import { treatmentKeys } from "@/lib/queries/treatment";
import type { PlanPhase } from "@/types/database";
import { PlanDetail } from "./plan-detail";
import { PlanInsurerCard } from "./plan-insurer-card";
import { PlanList } from "./plan-list";

// ---------------------------------------------------------------------------
// PlanWorkspace — orquesta lista de planes + detalle activo (nuevo o
// seleccionado) para un paciente concreto. Componente CLIENTE: toda la carga
// de datos pasa por los hooks de React Query de `use-treatment.ts`. Espejo
// estructural de `PerioWorkspace`.
// ---------------------------------------------------------------------------

export interface PlanWorkspaceProps {
  salonId: string;
  customerId: string;
  /**
   * Oculta el enlace "Cambiar paciente" cuando la vista va EMBEBIDA dentro de la
   * ficha del paciente (pestaña Planes de `/customers/[id]`), donde el paciente
   * ya está fijado y ese enlace no tiene sentido. En la ruta suelta se omite
   * (por defecto `false`) para conservar el flujo de cambio de paciente.
   */
  hideChangePatient?: boolean;
  /**
   * Si el usuario puede borrar planes (owner/manager). Se resuelve en servidor
   * y baja como prop: sin esto la lista ofrecería un botón que la server action
   * rechaza, y el usuario se llevaría un error en lugar de una decisión.
   */
  canDeletePlans?: boolean;
}

/**
 * Añade una fase a un plan. `use-treatment.ts` no expone un hook para esto
 * (solo lo pide `addPlanItem`/`transitionPlanItem`/`createPlan`/`deletePlanItem`),
 * así que se envuelve aquí la server action con `useMutation`, igual patrón
 * que los hooks de `use-treatment.ts`: invalida `treatmentKeys.plan(...)` en éxito.
 */
function useAddPlanPhase(salonId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddPlanPhaseInput) => {
      const result = await addPlanPhase(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: treatmentKeys.plan(salonId, planId),
      });
    },
  });
}

export function PlanWorkspace({
  salonId,
  customerId,
  hideChangePatient = false,
  canDeletePlans = false,
}: PlanWorkspaceProps): React.ReactElement {
  const plansQuery = usePlans(salonId, customerId);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createPlanMutation = useCreatePlan(salonId, customerId);
  // Borrado de un plan entero. Arrastra fases y líneas en cascada, así que pasa
  // por confirmación: `pendingDeleteId` es el plan sobre el que se preguntó.
  const deletePlanMutation = useDeletePlan(salonId, customerId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleConfirmDelete() {
    const planId = pendingDeleteId;
    if (planId === null) return;
    setDeleteError(null);
    deletePlanMutation.mutate(planId, {
      onSuccess: () => {
        setPendingDeleteId(null);
        // Si el plan borrado era el que se estaba mirando, la columna derecha
        // se queda sin sujeto: volver al estado "ningún plan seleccionado".
        setActivePlanId((actual) => (actual === planId ? null : actual));
      },
      onError: (err: unknown) => {
        setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar el plan.");
      },
    });
  }
  const planDetailQuery = usePlan(salonId, activePlanId ?? "");

  function handleCreatePlan() {
    setCreateError(null);
    createPlanMutation.mutate(
      { customerId },
      {
        onSuccess: (plan) => setActivePlanId(plan.id),
        onError: (err: unknown) => {
          setCreateError(err instanceof Error ? err.message : "Error al crear el plan.");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: icono + enlace para cambiar de paciente */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground"
          >
            <ClipboardList className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-medium text-muted-foreground">
            Planes de tratamiento
          </h2>
        </div>
        {!hideChangePatient && (
          <Link
            href="/planes"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Cambiar paciente
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Columna izquierda: nuevo plan + lista */}
        <div className="space-y-3">
          <Button
            onClick={handleCreatePlan}
            disabled={createPlanMutation.isPending}
            size="sm"
            className="w-full gap-1.5"
          >
            {createPlanMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Nuevo plan
          </Button>

          {createError !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {createError}
            </p>
          )}

          {plansQuery.isLoading ? (
            <p className="px-1 text-xs text-muted-foreground">Cargando planes…</p>
          ) : plansQuery.isError ? (
            <p className="px-1 text-xs text-destructive">Error al cargar los planes.</p>
          ) : (
            <PlanList
              plans={plansQuery.data ?? []}
              onSelect={setActivePlanId}
              selectedId={activePlanId ?? undefined}
              onDelete={
                canDeletePlans
                  ? (planId) => {
                      setDeleteError(null);
                      setPendingDeleteId(planId);
                    }
                  : undefined
              }
              deletingId={deletePlanMutation.isPending ? pendingDeleteId : null}
            />
          )}
        </div>

        {/* Columna derecha: plan activo */}
        <div className="space-y-4">
          {activePlanId === null ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Selecciona un plan o crea uno nuevo.
              </CardContent>
            </Card>
          ) : planDetailQuery.isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Cargando plan…
              </CardContent>
            </Card>
          ) : planDetailQuery.isError || planDetailQuery.data === undefined ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-destructive">
                Error al cargar el plan.
              </CardContent>
            </Card>
          ) : (
            <>
              <PlanInsurerCard
                salonId={salonId}
                customerId={customerId}
                planId={activePlanId}
                insurerId={planDetailQuery.data.plan.insurer_id}
              />
              <PlanDetail
                salonId={salonId}
                plan={planDetailQuery.data.plan}
                phases={planDetailQuery.data.phases}
                items={planDetailQuery.data.items}
              />
              <AddItemForm
                salonId={salonId}
                planId={activePlanId}
                phases={planDetailQuery.data.phases}
              />
              <AddPhaseForm salonId={salonId} planId={activePlanId} />
            </>
          )}
        </div>
      </div>

      {/* Confirmación de borrado. Un plan borrado se lleva por delante sus
          fases y sus líneas (ON DELETE CASCADE), y eso no tiene vuelta atrás:
          por eso hay una pregunta explícita en lugar de un borrado directo. */}
      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este plan?</DialogTitle>
            <DialogDescription>
              Se borrará el plan con todas sus fases y todas sus líneas de
              presupuesto. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {deleteError !== null && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingDeleteId(null);
                setDeleteError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletePlanMutation.isPending}
              onClick={handleConfirmDelete}
            >
              {deletePlanMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddItemForm — añade una línea presupuestada al plan activo
// ---------------------------------------------------------------------------

interface AddItemFormProps {
  salonId: string;
  planId: string;
  phases: readonly PlanPhase[];
}

function AddItemForm({ salonId, planId, phases }: AddItemFormProps): React.ReactElement {
  const servicesQuery = useServices(salonId, "");
  const addItemMutation = useAddPlanItem(salonId, planId);

  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [fdiCode, setFdiCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceEuros, setUnitPriceEuros] = useState("0.00");
  const [phaseId, setPhaseId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  /** Al elegir un servicio, pre-rellena el precio unitario con `price_cents`. */
  function handleServiceChange(value: string) {
    setServiceId(value);
    const service = (servicesQuery.data ?? []).find((s) => s.id === value);
    if (service !== undefined) {
      setUnitPriceEuros((service.price_cents / 100).toFixed(2));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setFormError("La cantidad debe ser un número mayor que 0.");
      return;
    }

    const parsedPrice = Number(unitPriceEuros.replace(",", "."));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError("El precio unitario no es válido.");
      return;
    }

    const trimmedFdi = fdiCode.trim();
    let parsedFdi: number | null = null;
    if (trimmedFdi !== "") {
      parsedFdi = Number(trimmedFdi);
      if (!Number.isFinite(parsedFdi)) {
        setFormError("El código FDI del diente no es válido.");
        return;
      }
    }

    addItemMutation.mutate(
      {
        planId,
        phaseId: phaseId === "" ? null : phaseId,
        serviceId: serviceId === "" ? null : serviceId,
        description: description.trim() === "" ? null : description.trim(),
        fdiCode: parsedFdi,
        quantity: parsedQuantity,
        unitPriceCents: Math.round(parsedPrice * 100),
      },
      {
        onSuccess: () => {
          setServiceId("");
          setDescription("");
          setFdiCode("");
          setQuantity("1");
          setUnitPriceEuros("0.00");
          setPhaseId("");
        },
        onError: (err: unknown) => {
          setFormError(err instanceof Error ? err.message : "Error al añadir la línea.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Añadir línea
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="item-service">Servicio</Label>
              <Select value={serviceId} onValueChange={handleServiceChange}>
                <SelectTrigger id="item-service">
                  <SelectValue placeholder="Sin servicio (línea libre)" />
                </SelectTrigger>
                <SelectContent>
                  {(servicesQuery.data ?? []).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="item-phase">Fase</Label>
              <Select value={phaseId} onValueChange={setPhaseId}>
                <SelectTrigger id="item-phase">
                  <SelectValue placeholder="Sin fase" />
                </SelectTrigger>
                <SelectContent>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="item-description">Descripción (opcional)</Label>
            <Input
              id="item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción libre si no hay servicio"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="item-fdi">Diente (FDI, opcional)</Label>
              <Input
                id="item-fdi"
                inputMode="numeric"
                value={fdiCode}
                onChange={(e) => setFdiCode(e.target.value)}
                placeholder="Ej. 11"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-quantity">Cantidad</Label>
              <Input
                id="item-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-price">Precio unitario (€)</Label>
              <Input
                id="item-price"
                type="number"
                min="0"
                step="0.01"
                value={unitPriceEuros}
                onChange={(e) => setUnitPriceEuros(e.target.value)}
              />
            </div>
          </div>

          {formError !== null && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={addItemMutation.isPending}
            className="gap-1.5"
          >
            {addItemMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Añadir línea
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AddPhaseForm — añade una fase al plan activo
// ---------------------------------------------------------------------------

interface AddPhaseFormProps {
  salonId: string;
  planId: string;
}

function AddPhaseForm({ salonId, planId }: AddPhaseFormProps): React.ReactElement {
  const addPhaseMutation = useAddPlanPhase(salonId, planId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("El nombre de la fase no puede estar vacío.");
      return;
    }
    addPhaseMutation.mutate(
      { planId, name: trimmed },
      {
        onSuccess: () => setName(""),
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : "Error al añadir la fase.");
        },
      },
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form className="flex items-end gap-2" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-phase-name">Nueva fase</Label>
            <Input
              id="new-phase-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Fase 1 — Urgencias"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={addPhaseMutation.isPending}
            className="gap-1.5"
          >
            {addPhaseMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Añadir fase
          </Button>
        </form>
        {error !== null && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
