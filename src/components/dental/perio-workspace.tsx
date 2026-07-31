"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2, PlusCircle, Save, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPerioExam, type PerioSiteInput } from "@/app/(dashboard)/periodontograma/actions";
import {
  usePerioExam,
  usePerioExams,
  useSavePerioExam,
  useSignPerioExam,
} from "@/hooks/use-perio";
import type { PerioSiteMeasurement } from "@/lib/dental/perio";
import { PerioChart, mapPerioSitesToMeasurements, type PerioChartDraft } from "./perio-chart";
import { PerioHistory } from "./perio-history";
import { PerioSummary } from "./perio-summary";

// ---------------------------------------------------------------------------
// PerioWorkspace — orquesta historial + exploración activa (nueva o
// seleccionada) para un paciente concreto. Componente CLIENTE: toda la carga
// de datos pasa por los hooks de React Query de `use-perio.ts`.
// ---------------------------------------------------------------------------

export interface PerioWorkspaceProps {
  salonId: string;
  customerId: string;
}

/** `PerioSiteInput` (borrador en vivo) → `PerioSiteMeasurement` (lo que espera PerioSummary). */
function toMeasurement(s: PerioSiteInput): PerioSiteMeasurement {
  return {
    fdi_tooth: s.fdi_tooth,
    site: s.site,
    pd_mm: s.pd_mm,
    gingival_margin_mm: s.gingival_margin_mm ?? 0,
    bop: s.bop ?? false,
  };
}

export function PerioWorkspace({
  salonId,
  customerId,
}: PerioWorkspaceProps): React.ReactElement {
  const examsQuery = usePerioExams(salonId, customerId);

  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<PerioChartDraft | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const examDetailQuery = usePerioExam(salonId, activeExamId ?? "");
  const saveMutation = useSavePerioExam(salonId, activeExamId ?? "");
  const signMutation = useSignPerioExam(salonId, activeExamId ?? "");

  function handleSelectExam(examId: string) {
    setActiveExamId(examId);
    setLiveDraft(null);
    setCreateError(null);
    setActionError(null);
  }

  async function handleCreateExam() {
    setCreateError(null);
    setIsCreating(true);
    try {
      const result = await createPerioExam({ customerId });
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setActiveExamId(result.data.id);
      setLiveDraft(null);
    } finally {
      setIsCreating(false);
    }
  }

  function handleSave() {
    if (activeExamId === null || liveDraft === null) return;
    setActionError(null);
    startTransition(() => {
      void saveMutation
        .mutateAsync({ teeth: liveDraft.teeth, sites: liveDraft.sites })
        .catch((err: unknown) => {
          setActionError(err instanceof Error ? err.message : "Error al guardar la exploración.");
        });
    });
  }

  function handleSign() {
    if (activeExamId === null) return;
    setActionError(null);
    startTransition(() => {
      void signMutation.mutateAsync().catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al firmar la exploración.");
      });
    });
  }

  const exam = examDetailQuery.data;
  const isSigned = exam?.exam.signed ?? false;
  // Editable mientras no esté firmada, sea una exploración recién creada o una
  // retomada del historial (el badge "Borrador" en PerioHistory solo tiene
  // sentido si un borrador se puede seguir editando). Firmada ⇒ siempre readOnly
  // (la BD lo hace inmutable de todos modos vía trg_perio_exam_immutable).
  const isEditable = activeExamId !== null && exam !== undefined && !isSigned;

  const summarySites: PerioSiteMeasurement[] =
    isEditable && liveDraft !== null
      ? liveDraft.sites.map(toMeasurement)
      : mapPerioSitesToMeasurements(exam?.teeth ?? [], exam?.sites ?? []);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Columna izquierda: nueva exploración + historial */}
      <div className="space-y-3">
        <Button
          onClick={() => void handleCreateExam()}
          disabled={isCreating}
          size="sm"
          className="w-full gap-1.5"
        >
          {isCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Nueva exploración
        </Button>

        {createError !== null && (
          <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {createError}
          </p>
        )}

        {examsQuery.isLoading ? (
          <p className="px-1 text-xs text-muted-foreground">Cargando historial…</p>
        ) : examsQuery.isError ? (
          <p className="px-1 text-xs text-destructive">Error al cargar el historial.</p>
        ) : (
          <PerioHistory
            exams={examsQuery.data ?? []}
            onSelect={handleSelectExam}
            selectedId={activeExamId ?? undefined}
          />
        )}
      </div>

      {/* Columna derecha: exploración activa */}
      <div className="space-y-4">
        {activeExamId === null ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Crea una nueva exploración o selecciona una del historial.
            </CardContent>
          </Card>
        ) : examDetailQuery.isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Cargando exploración…
            </CardContent>
          </Card>
        ) : examDetailQuery.isError || exam === undefined ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-destructive">
              Error al cargar la exploración.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant={isSigned ? "default" : "outline"}>
                {isSigned ? "Firmada" : "Borrador"}
              </Badge>

              {isEditable && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={saveMutation.isPending || liveDraft === null}
                    onClick={handleSave}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={signMutation.isPending}
                    onClick={handleSign}
                  >
                    {signMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Firmar
                  </Button>
                </div>
              )}
            </div>

            {actionError !== null && (
              <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {actionError}
              </p>
            )}

            <PerioSummary sites={summarySites} />

            <PerioChart
              key={activeExamId}
              teeth={exam.teeth}
              sites={exam.sites}
              readOnly={!isEditable}
              onChange={isEditable ? setLiveDraft : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
