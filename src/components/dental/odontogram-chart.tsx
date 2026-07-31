"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PERMANENT_FDI_NUMBERS,
  TEMPORARY_FDI_NUMBERS,
  TEETH,
} from "@/lib/dental/tooth";
import { TOOTH_COLORS } from "@/lib/dental/color";
import { useOdontogramFindings, useAddFinding } from "@/hooks/use-odontogram";
import type { OdontogramFindingInsert } from "@/types/database";
import { ToothSvg } from "./tooth-svg";
import { FindingPanel } from "./finding-panel";

// ---------------------------------------------------------------------------
// FDI row slices in standard visual charting order
// ---------------------------------------------------------------------------

const UPPER_PERM = PERMANENT_FDI_NUMBERS.slice(0, 16) as readonly number[];
const LOWER_PERM = PERMANENT_FDI_NUMBERS.slice(16, 32) as readonly number[];
const UPPER_TEMP = TEMPORARY_FDI_NUMBERS.slice(0, 10) as readonly number[];
const LOWER_TEMP = TEMPORARY_FDI_NUMBERS.slice(10, 20) as readonly number[];

// ---------------------------------------------------------------------------
// Dentition toggle
// ---------------------------------------------------------------------------

type DentitionMode = "permanent" | "temporary" | "both";

const DENTITION_LABELS: Record<DentitionMode, string> = {
  permanent: "Permanente",
  temporary: "Temporal",
  both:      "Ambas",
};

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend(): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {(
        Object.entries(TOOTH_COLORS) as [
          string,
          (typeof TOOTH_COLORS)[keyof typeof TOOTH_COLORS],
        ][]
      ).map(([state, colors]) => (
        <span
          key={state}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className="inline-block w-3 h-3 rounded-sm border"
            style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
          />
          {colors.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToothRow
// ---------------------------------------------------------------------------

interface ToothRowProps {
  fdis: readonly number[];
  currentStates: Map<number, { tooth_state: string; affected_surfaces: string[] }>;
  selectedFdi: number | null;
  onSelect: (fdi: number) => void;
}

function ToothRow({
  fdis,
  currentStates,
  selectedFdi,
  onSelect,
}: ToothRowProps): React.ReactElement {
  return (
    <div className="flex justify-center gap-0.5 flex-wrap">
      {fdis.map((fdi) => {
        const tooth = TEETH[fdi];
        if (!tooth) return null;
        const cs = currentStates.get(fdi);
        return (
          <div key={fdi} className="flex flex-col items-center gap-0.5">
            <ToothSvg
              tooth={tooth}
              size="grid"
              state={
                cs?.tooth_state as Parameters<typeof ToothSvg>[0]["state"]
              }
              affectedSurfaces={cs?.affected_surfaces ?? []}
              isSelected={selectedFdi === fdi}
              onToothClick={() => onSelect(fdi)}
            />
            <span
              className={[
                "text-[8px] font-mono leading-none tabular-nums",
                selectedFdi === fdi
                  ? "text-primary font-semibold"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {fdi}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OdontogramChart — main export
// ---------------------------------------------------------------------------

export interface OdontogramChartProps {
  salonId: string;
  /**
   * clinical_record_id (= customer_id) for the patient to load.
   * Pass empty string for demo / no-patient mode (chart is read-only).
   */
  clinicalRecordId: string;
}

export function OdontogramChart({
  salonId,
  clinicalRecordId,
}: OdontogramChartProps): React.ReactElement {
  const [dentitionMode, setDentitionMode] = useState<DentitionMode>("permanent");
  const [selectedFdi, setSelectedFdi]     = useState<number | null>(null);

  const { data, isLoading, isError } = useOdontogramFindings(
    salonId,
    clinicalRecordId,
  );
  const addFinding = useAddFinding(salonId, clinicalRecordId);

  const currentStates = data?.currentStates ?? new Map();

  function handleToothSelect(fdi: number) {
    setSelectedFdi((prev) => (prev === fdi ? null : fdi));
  }

  async function handleSave(input: OdontogramFindingInsert) {
    await addFinding.mutateAsync(input);
    setSelectedFdi(null);
  }

  const showPermanent = dentitionMode === "permanent" || dentitionMode === "both";
  const showTemporary = dentitionMode === "temporary" || dentitionMode === "both";

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium shrink-0">
          Dentición:
        </span>
        <div className="flex gap-1.5">
          {(["permanent", "temporary", "both"] as DentitionMode[]).map((mode) => (
            <Button
              key={mode}
              variant={dentitionMode === mode ? "default" : "outline"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => {
                setDentitionMode(mode);
                setSelectedFdi(null);
              }}
            >
              {DENTITION_LABELS[mode]}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {isLoading && clinicalRecordId.length > 0 && (
            <span>Cargando hallazgos…</span>
          )}
          {isError && (
            <span className="text-destructive">Error al cargar hallazgos</span>
          )}
          {!clinicalRecordId && (
            <span className="italic">Vista previa — selecciona un paciente para guardar</span>
          )}
        </div>
      </div>

      {/* Chart grid */}
      <Card>
        <CardContent className="py-5 px-3 space-y-3">
          {/* Upper temporary */}
          {showTemporary && (
            <div className="space-y-1">
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest text-center">
                Temporal superior · Q5–Q6
              </p>
              <ToothRow
                fdis={UPPER_TEMP}
                currentStates={currentStates}
                selectedFdi={selectedFdi}
                onSelect={handleToothSelect}
              />
            </div>
          )}

          {/* Upper permanent */}
          {showPermanent && (
            <div className="space-y-1">
              {showTemporary && (
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest text-center">
                  Permanente superior · Q1–Q2
                </p>
              )}
              <ToothRow
                fdis={UPPER_PERM}
                currentStates={currentStates}
                selectedFdi={selectedFdi}
                onSelect={handleToothSelect}
              />
            </div>
          )}

          {/* Midline */}
          <div className="relative flex items-center py-0.5" aria-hidden="true">
            <div className="flex-1 h-px bg-border" />
            <span className="mx-2 text-[9px] text-muted-foreground uppercase tracking-widest">
              línea media
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Lower permanent */}
          {showPermanent && (
            <div className="space-y-1">
              <ToothRow
                fdis={LOWER_PERM}
                currentStates={currentStates}
                selectedFdi={selectedFdi}
                onSelect={handleToothSelect}
              />
              {showTemporary && (
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest text-center">
                  Permanente inferior · Q3–Q4
                </p>
              )}
            </div>
          )}

          {/* Lower temporary */}
          {showTemporary && (
            <div className="space-y-1">
              <ToothRow
                fdis={LOWER_TEMP}
                currentStates={currentStates}
                selectedFdi={selectedFdi}
                onSelect={handleToothSelect}
              />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest text-center">
                Temporal inferior · Q7–Q8
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finding panel — appears when a tooth is selected */}
      {selectedFdi !== null && (
        <FindingPanel
          key={selectedFdi}
          fdi={selectedFdi}
          salonId={salonId}
          clinicalRecordId={clinicalRecordId}
          currentState={currentStates.get(selectedFdi)}
          onClose={() => setSelectedFdi(null)}
          onSave={handleSave}
          isSaving={addFinding.isPending}
        />
      )}

      {/* Legend */}
      <Card className="border-dashed">
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Leyenda
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4 pb-3">
          <Legend />
        </CardContent>
      </Card>
    </div>
  );
}
