"use client";

import { useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FilePenLine,
  Loader2,
  Pill,
  Printer,
  ShieldOff,
  Stamp,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useDeletePrescription,
  useIssuePrescription,
  usePrescriptionItems,
  useRevokePrescription,
} from "@/hooks/use-prescriptions";
import {
  PRESCRIPTION_STATUS_LABELS,
  canIssuePrescription,
  canRevokePrescription,
} from "@/lib/dental/prescriptions";
import type { Prescription, PrescriptionStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// PrescriptionList — lista de recetas de un paciente. Componente CLIENTE:
// llama directamente a `useIssuePrescription`/`useRevokePrescription`/
// `useDeletePrescription` (cada fila necesita su propio botón de acción),
// mismo patrón que `ConsentList`. Los renglones de medicación se cargan solo
// al expandir una receta (`usePrescriptionItems`), igual que `ConsentList`
// difiere el cuerpo del consentimiento hasta que se pulsa "Ver texto".
// ---------------------------------------------------------------------------

export interface PrescriptionListProps {
  salonId: string;
  customerId: string;
  prescriptions: readonly Prescription[];
}

/** Color del badge de estado: ámbar (borrador), verde (emitida), gris (revocada). */
const STATUS_BADGE_CLASSES: Record<PrescriptionStatus, string> = {
  draft: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  issued:
    "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  revoked: "border-transparent bg-muted text-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PrescriptionList({
  salonId,
  customerId,
  prescriptions,
}: PrescriptionListProps): React.ReactElement {
  const issueMutation = useIssuePrescription(salonId, customerId);
  const revokeMutation = useRevokePrescription(salonId, customerId);
  const deleteMutation = useDeletePrescription(salonId, customerId);

  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleIssue(prescriptionId: string) {
    setActionError(null);
    issueMutation.mutate(prescriptionId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al emitir la receta.");
      },
    });
  }

  function handleRevoke(prescriptionId: string) {
    setActionError(null);
    revokeMutation.mutate(prescriptionId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al revocar la receta.");
      },
    });
  }

  function handleDelete(prescriptionId: string) {
    setActionError(null);
    deleteMutation.mutate(prescriptionId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al borrar la receta.");
      },
    });
  }

  if (prescriptions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <span
            aria-hidden="true"
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10"
          >
            <Pill className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium">Sin recetas todavía</p>
          <p className="mt-1 max-w-[30ch] text-xs text-muted-foreground">
            Crea la primera receta para este paciente con «Nueva receta».
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {actionError !== null && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {prescriptions.map((prescription) => {
        const isExpanded = expandedId === prescription.id;

        return (
          <Card key={prescription.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{prescription.diagnosis ?? "Receta"}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(prescription.created_at)}</span>
                    {prescription.prescriber_name !== null && prescription.prescriber_name !== "" && (
                      <span>{prescription.prescriber_name}</span>
                    )}
                  </div>
                </div>
                <Badge className={STATUS_BADGE_CLASSES[prescription.status]}>
                  {PRESCRIPTION_STATUS_LABELS[prescription.status]}
                </Badge>
              </div>

              {prescription.notes !== null && prescription.notes !== "" && (
                <p className="text-xs text-muted-foreground">{prescription.notes}</p>
              )}

              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setExpandedId(isExpanded ? null : prescription.id)}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  )}
                  {isExpanded ? "Ocultar renglones" : "Ver renglones"}
                </button>
                {isExpanded && (
                  <PrescriptionItemsView salonId={salonId} prescriptionId={prescription.id} />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {/* Solo una receta EMITIDA se imprime: un borrador no es una
                    receta, y darle un papel al paciente antes de emitirla haría
                    creer que ya está hecha. Una revocada tampoco se reimprime. */}
                {prescription.status === "issued" && (
                  <Button asChild type="button" size="sm" variant="outline" className="gap-1.5">
                    <a
                      href={`/api/recetas/${prescription.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      Imprimir
                    </a>
                  </Button>
                )}
                {canIssuePrescription(prescription.status) && (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={issueMutation.isPending}
                    onClick={() => handleIssue(prescription.id)}
                  >
                    {issueMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Stamp className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Emitir
                  </Button>
                )}
                {canRevokePrescription(prescription.status) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={revokeMutation.isPending}
                    onClick={() => handleRevoke(prescription.id)}
                  >
                    {revokeMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Revocar
                  </Button>
                )}
                {prescription.status === "draft" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(prescription.id)}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Borrar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrescriptionItemsView — renglones de medicación en solo lectura, formato
// limpio/imprimible (nombre + dosis · pauta · duración · cantidad, e
// instrucciones si las hay). Se usa tanto para recetas emitidas como en
// borrador/revocadas: siempre es una vista de solo lectura de lo YA guardado.
// ---------------------------------------------------------------------------

interface PrescriptionItemsViewProps {
  salonId: string;
  prescriptionId: string;
}

function PrescriptionItemsView({
  salonId,
  prescriptionId,
}: PrescriptionItemsViewProps): React.ReactElement {
  const itemsQuery = usePrescriptionItems(salonId, prescriptionId);

  if (itemsQuery.isLoading) {
    return <p className="mt-2 text-xs text-muted-foreground">Cargando renglones…</p>;
  }
  if (itemsQuery.isError) {
    return <p className="mt-2 text-xs text-destructive">Error al cargar los renglones.</p>;
  }

  const items = itemsQuery.data ?? [];
  if (items.length === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FilePenLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Sin renglones de medicación todavía.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3">
      {items.map((item) => {
        const meta = [item.dose, item.frequency, item.duration, item.quantity].filter(
          (value): value is string => value !== null && value !== "",
        );

        return (
          <li key={item.id} className="text-xs">
            <span className="font-medium text-foreground">{item.medication}</span>
            {meta.length > 0 && <span className="text-muted-foreground"> — {meta.join(" · ")}</span>}
            {item.instructions !== null && item.instructions !== "" && (
              <p className="mt-0.5 text-muted-foreground">{item.instructions}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
