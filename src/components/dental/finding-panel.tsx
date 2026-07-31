"use client";

import { useState, useTransition } from "react";
import { X, Save, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TEETH, type Tooth } from "@/lib/dental/tooth";
import { TOOTH_COLORS, TOOTH_STATE_OPTIONS, type ToothState } from "@/lib/dental/color";
import { getSurfaces, SURFACE_DEFS, type Surface } from "@/lib/dental/catalog";
import type { CurrentToothState } from "@/lib/queries/odontogram";
import type { DentalFindingType, DentalToothState, OdontogramFindingInsert } from "@/types/database";
import { ToothSvg } from "./tooth-svg";

// ---------------------------------------------------------------------------
// Finding type options (Spanish labels)
// ---------------------------------------------------------------------------

const FINDING_TYPE_OPTIONS: { value: DentalFindingType; label: string }[] = [
  { value: "sano",           label: "Sano" },
  { value: "caries",         label: "Caries" },
  { value: "obturacion",     label: "Obturación" },
  { value: "endodoncia",     label: "Endodoncia" },
  { value: "corona",         label: "Corona protésica" },
  { value: "implante",       label: "Implante" },
  { value: "extraccion",     label: "Extracción" },
  { value: "puente",         label: "Puente" },
  { value: "fractura",       label: "Fractura" },
  { value: "erosion",        label: "Erosión / abrasión" },
  { value: "sellador",       label: "Sellador" },
  { value: "blanqueamiento", label: "Blanqueamiento" },
  { value: "nota",           label: "Nota clínica" },
];

/** Default tooth_state derived from the most common clinical association. */
function defaultStateForFinding(type: DentalFindingType): DentalToothState {
  switch (type) {
    case "sano":           return "sano";
    case "caries":
    case "fractura":
    case "erosion":        return "pendiente";
    case "obturacion":
    case "endodoncia":
    case "puente":
    case "sellador":
    case "blanqueamiento": return "hecho";
    case "corona":         return "corona";
    case "implante":       return "implante";
    case "extraccion":     return "ausente";
    case "nota":           return "sano";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FindingPanelProps {
  fdi: number;
  salonId: string;
  clinicalRecordId: string;
  currentState?: CurrentToothState;
  onClose: () => void;
  onSave: (input: OdontogramFindingInsert) => Promise<void>;
  isSaving?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FindingPanel({
  fdi,
  salonId,
  clinicalRecordId,
  currentState,
  onClose,
  onSave,
  isSaving = false,
}: FindingPanelProps): React.ReactElement {
  const tooth = TEETH[fdi] as Tooth;
  const availableSurfaces = getSurfaces(tooth.toothClass, tooth.arch);

  const [findingType, setFindingType] = useState<DentalFindingType>("caries");
  const [toothState, setToothState]   = useState<DentalToothState>(
    defaultStateForFinding("caries"),
  );
  const [selectedSurfaces, setSelectedSurfaces] = useState<Set<Surface>>(new Set());
  const [notes, setNotes]                       = useState("");
  const [error, setError]                       = useState<string | null>(null);
  const [, startTransition]                     = useTransition();

  function handleFindingTypeChange(type: DentalFindingType) {
    setFindingType(type);
    setToothState(defaultStateForFinding(type));
  }

  function toggleSurface(surface: Surface) {
    setSelectedSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(surface)) next.delete(surface);
      else next.add(surface);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    const input: OdontogramFindingInsert = {
      clinical_record_id: clinicalRecordId,
      salon_id:           salonId,
      fdi_tooth:          fdi,
      surfaces:           [...selectedSurfaces],
      finding_type:       findingType,
      tooth_state:        toothState,
      notes:              notes.trim() || undefined,
    };
    startTransition(() => {
      void onSave(input).catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Error al guardar el hallazgo.",
        );
      });
    });
  }

  const currentColors = currentState
    ? TOOTH_COLORS[currentState.tooth_state as ToothState]
    : TOOTH_COLORS.sano;

  return (
    <Card className="border-primary/20 bg-card shadow-md animate-in slide-in-from-bottom-4 duration-200">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Diente {fdi}</CardTitle>
          <CardDescription className="text-xs mt-0.5">{tooth.label}</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 -mt-1 -mr-1"
          onClick={onClose}
          aria-label="Cerrar panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Top row: large interactive tooth + status + surface chips */}
        <div className="flex gap-4 items-start">
          {/* Large tooth with clickable surfaces */}
          <div className="shrink-0">
            <ToothSvg
              tooth={tooth}
              size="detail"
              state={currentState?.tooth_state}
              affectedSurfaces={currentState?.affected_surfaces ?? []}
              selectedSurfaces={selectedSurfaces}
              onSurfaceClick={toggleSurface}
            />
            <p className="text-[9px] text-muted-foreground text-center mt-1 max-w-[120px]">
              Toca para seleccionar superficie
            </p>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {/* Current state */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Estado actual</p>
              {currentState ? (
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: currentColors.fill,
                    color:           currentColors.textHex,
                    borderColor:     currentColors.stroke,
                  }}
                >
                  {currentColors.label}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Sin hallazgos
                </Badge>
              )}
            </div>

            {/* Surface chip selector */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Superficies afectadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {availableSurfaces.map((surface) => {
                  const isActive = selectedSurfaces.has(surface);
                  const def = SURFACE_DEFS[surface];
                  return (
                    <button
                      key={surface}
                      type="button"
                      onClick={() => toggleSurface(surface)}
                      aria-pressed={isActive}
                      className={[
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                        isActive
                          ? "bg-blue-500 text-white border-blue-700"
                          : "bg-muted/50 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
                      ].join(" ")}
                    >
                      <span className="font-mono">{def.abbreviation}</span>
                      <span>{def.label}</span>
                    </button>
                  );
                })}
              </div>
              {selectedSurfaces.size === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Sin selección = hallazgo aplica al diente completo
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Finding type grid */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Tipo de hallazgo</p>
          <div className="grid grid-cols-2 gap-1">
            {FINDING_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleFindingTypeChange(opt.value)}
                className={[
                  "text-left px-2.5 py-1.5 rounded text-xs border transition-colors",
                  findingType === opt.value
                    ? "bg-primary text-primary-foreground border-primary font-medium"
                    : "bg-muted/40 text-foreground border-border hover:border-primary/40",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resulting state selector */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Estado resultante en odontograma
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TOOTH_STATE_OPTIONS.map((opt) => {
              const colors = TOOTH_COLORS[opt.value];
              const isActive = toothState === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setToothState(opt.value as DentalToothState)}
                  aria-pressed={isActive}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all"
                  style={
                    isActive
                      ? {
                          backgroundColor: colors.fill,
                          color:           colors.textHex,
                          borderColor:     colors.stroke,
                          fontWeight:      600,
                          boxShadow:       "0 0 0 2px " + colors.stroke + "40",
                        }
                      : {
                          color:       colors.fill === "#ffffff" ? "#374151" : colors.fill,
                          borderColor: colors.stroke,
                        }
                  }
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: colors.fill,
                      border:          "1px solid " + colors.stroke,
                    }}
                  />
                  {colors.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Notas clínicas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Observaciones del profesional…"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Error */}
        {error !== null && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={isSaving || clinicalRecordId.length === 0}
            size="sm"
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Guardando…" : "Registrar hallazgo"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {clinicalRecordId.length === 0 && (
            <p className="text-[10px] text-muted-foreground ml-auto">
              Selecciona un paciente para guardar
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
