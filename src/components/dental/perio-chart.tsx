"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PerioSiteInput, PerioToothInput } from "@/app/(dashboard)/periodontograma/actions";
import { groupSitesByToothId } from "@/lib/queries/perio";
import {
  SITE_LABELS,
  SITE_ORDER,
  deriveCal,
  type PerioSiteMeasurement,
} from "@/lib/dental/perio";
import { PERMANENT_FDI_NUMBERS, getTooth } from "@/lib/dental/tooth";
import type { PerioSite, PerioTooth } from "@/types/database";

// ---------------------------------------------------------------------------
// Draft shape — lo que produce este componente para que el caller construya
// PerioToothInput[]/PerioSiteInput[] tal cual espera savePerioMeasurements.
// ---------------------------------------------------------------------------

export interface PerioChartDraft {
  teeth: PerioToothInput[];
  sites: PerioSiteInput[];
}

export interface PerioChartProps {
  teeth: PerioTooth[];
  sites: PerioSite[];
  readOnly?: boolean;
  onChange?: (draft: PerioChartDraft) => void;
}

// ---------------------------------------------------------------------------
// Estado interno editable
// ---------------------------------------------------------------------------

interface ToothDraftState {
  mobility: number;
  furcation: number;
  plaque: boolean;
}

interface SiteDraftState {
  pd_mm: number;
  gingival_margin_mm: number;
  bop: boolean;
  suppuration: boolean;
  plaque: boolean;
}

const DEFAULT_TOOTH_DRAFT: ToothDraftState = { mobility: 0, furcation: 0, plaque: false };
const DEFAULT_SITE_DRAFT: SiteDraftState = {
  pd_mm: 0,
  gingival_margin_mm: 0,
  bop: false,
  suppuration: false,
  plaque: false,
};

const THIRD_MOLAR_POSITION = 8;

/**
 * Set de trabajo por defecto al iniciar una exploración nueva (sin `teeth`
 * todavía guardados): los 28 dientes permanentes sin terceros molares, en el
 * orden de carta estándar. Si `teeth` trae datos (exploración en curso o ya
 * guardada), se usa ESE conjunto en su lugar — soporta cualquier subconjunto,
 * terceros molares incluidos.
 */
const DEFAULT_CHART_FDI: readonly number[] = PERMANENT_FDI_NUMBERS.filter(
  (fdi) => fdi % 10 !== THIRD_MOLAR_POSITION,
);

/** Orden de carta (FDI) a renderizar: el de `teeth` si trae datos, si no el set por defecto. */
function resolveFdiList(teeth: readonly PerioTooth[]): readonly number[] {
  if (teeth.length === 0) return DEFAULT_CHART_FDI;
  const present = new Set(teeth.map((t) => t.fdi_tooth));
  return PERMANENT_FDI_NUMBERS.filter((fdi) => present.has(fdi));
}

interface ChartState {
  toothState: Record<number, ToothDraftState>;
  siteState: Record<number, Record<number, SiteDraftState>>;
}

/** Construye el estado inicial cruzando `sites.tooth_id` con `teeth[].id` (perio_site no tiene fdi_tooth). */
function buildInitialState(
  teeth: readonly PerioTooth[],
  sites: readonly PerioSite[],
  fdiList: readonly number[],
): ChartState {
  const sitesByToothId = groupSitesByToothId(sites);
  const toothState: Record<number, ToothDraftState> = {};
  const siteState: Record<number, Record<number, SiteDraftState>> = {};

  for (const fdi of fdiList) {
    const savedTooth = teeth.find((t) => t.fdi_tooth === fdi);
    toothState[fdi] = savedTooth
      ? { mobility: savedTooth.mobility, furcation: savedTooth.furcation, plaque: savedTooth.plaque }
      : DEFAULT_TOOTH_DRAFT;

    const savedSites = savedTooth ? sitesByToothId.get(savedTooth.id) ?? [] : [];
    const bySiteCode = new Map(savedSites.map((s) => [s.site, s]));
    const perSite: Record<number, SiteDraftState> = {};
    for (const site of SITE_ORDER) {
      const saved = bySiteCode.get(site);
      perSite[site] = saved
        ? {
            pd_mm: saved.pd_mm,
            gingival_margin_mm: saved.gingival_margin_mm,
            bop: saved.bop,
            suppuration: saved.suppuration,
            plaque: saved.plaque,
          }
        : DEFAULT_SITE_DRAFT;
    }
    siteState[fdi] = perSite;
  }

  return { toothState, siteState };
}

/** Lee el borrador de un diente, con fallback seguro (noUncheckedIndexedAccess). */
function readTooth(toothState: Record<number, ToothDraftState>, fdi: number): ToothDraftState {
  return toothState[fdi] ?? DEFAULT_TOOTH_DRAFT;
}

/** Lee el borrador de un sitio, con fallback seguro (noUncheckedIndexedAccess). */
function readSite(
  siteState: Record<number, Record<number, SiteDraftState>>,
  fdi: number,
  site: number,
): SiteDraftState {
  return siteState[fdi]?.[site] ?? DEFAULT_SITE_DRAFT;
}

/** Etiqueta corta del sitio (MB/B/DB/ML/L/DL); fallback al código si faltara. */
function siteLabel(site: number): string {
  return SITE_LABELS[site] ?? String(site);
}

function buildDraft(
  fdiList: readonly number[],
  toothState: Record<number, ToothDraftState>,
  siteState: Record<number, Record<number, SiteDraftState>>,
): PerioChartDraft {
  const teethDraft: PerioToothInput[] = fdiList.map((fdi) => ({
    fdi_tooth: fdi,
    ...readTooth(toothState, fdi),
  }));
  const sitesDraft: PerioSiteInput[] = fdiList.flatMap((fdi) =>
    SITE_ORDER.map((site) => ({
      fdi_tooth: fdi,
      site,
      ...readSite(siteState, fdi, site),
    })),
  );
  return { teeth: teethDraft, sites: sitesDraft };
}

// ---------------------------------------------------------------------------
// Helper público — sites+teeth (formato BD) → PerioSiteMeasurement[] (formato
// que consumen computePerioRollups/perioStage vía PerioSummary). Cruza
// sites.tooth_id con teeth[].id (perio_site no tiene fdi_tooth).
// ---------------------------------------------------------------------------

export function mapPerioSitesToMeasurements(
  teeth: readonly PerioTooth[],
  sites: readonly PerioSite[],
): PerioSiteMeasurement[] {
  const toothById = new Map(teeth.map((t) => [t.id, t]));
  const result: PerioSiteMeasurement[] = [];
  for (const s of sites) {
    const tooth = toothById.get(s.tooth_id);
    if (tooth === undefined) continue;
    result.push({
      fdi_tooth: tooth.fdi_tooth,
      site: s.site,
      pd_mm: s.pd_mm,
      gingival_margin_mm: s.gingival_margin_mm,
      bop: s.bop,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// PerioChart — main export
// ---------------------------------------------------------------------------

export function PerioChart({
  teeth,
  sites,
  readOnly = false,
  onChange,
}: PerioChartProps): React.ReactElement {
  const fdiList = resolveFdiList(teeth);
  const [state, setState] = useState<ChartState>(() => buildInitialState(teeth, sites, fdiList));

  function updateTooth(fdi: number, patch: Partial<ToothDraftState>) {
    const nextToothState = {
      ...state.toothState,
      [fdi]: { ...readTooth(state.toothState, fdi), ...patch },
    };
    setState({ toothState: nextToothState, siteState: state.siteState });
    onChange?.(buildDraft(fdiList, nextToothState, state.siteState));
  }

  function updateSite(fdi: number, site: number, patch: Partial<SiteDraftState>) {
    const nextSiteState = {
      ...state.siteState,
      [fdi]: {
        ...state.siteState[fdi],
        [site]: { ...readSite(state.siteState, fdi, site), ...patch },
      },
    };
    setState({ toothState: state.toothState, siteState: nextSiteState });
    onChange?.(buildDraft(fdiList, state.toothState, nextSiteState));
  }

  if (fdiList.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Sin dientes registrados en esta exploración.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {fdiList.map((fdi) => (
        <ToothPerioRow
          key={fdi}
          fdi={fdi}
          tooth={readTooth(state.toothState, fdi)}
          sites={SITE_ORDER.map((site) => ({ site, draft: readSite(state.siteState, fdi, site) }))}
          readOnly={readOnly}
          onToothChange={(patch) => updateTooth(fdi, patch)}
          onSiteChange={(site, patch) => updateSite(fdi, site, patch)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToothPerioRow — cabecera de diente (movilidad/furca/placa) + 6 sitios
// ---------------------------------------------------------------------------

interface ToothPerioRowProps {
  fdi: number;
  tooth: ToothDraftState;
  sites: { site: number; draft: SiteDraftState }[];
  readOnly: boolean;
  onToothChange: (patch: Partial<ToothDraftState>) => void;
  onSiteChange: (site: number, patch: Partial<SiteDraftState>) => void;
}

function ToothPerioRow({
  fdi,
  tooth,
  sites,
  readOnly,
  onToothChange,
  onSiteChange,
}: ToothPerioRowProps): React.ReactElement {
  const toothInfo = getTooth(fdi);

  return (
    <Card>
      <CardContent className="space-y-2.5 py-3">
        {/* Cabecera del diente */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums">{fdi}</span>
            <span className="text-xs text-muted-foreground">{toothInfo?.label ?? "Diente"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {readOnly ? (
              <>
                <span className="text-xs text-muted-foreground">Movilidad {tooth.mobility}</span>
                <span className="text-xs text-muted-foreground">Furca {tooth.furcation}</span>
                {tooth.plaque && (
                  <Badge variant="outline" className="text-[10px]">
                    Placa
                  </Badge>
                )}
              </>
            ) : (
              <>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Movilidad
                  <select
                    aria-label={`Movilidad diente ${fdi}`}
                    value={tooth.mobility}
                    onChange={(e) => onToothChange({ mobility: Number(e.target.value) })}
                    className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Furca
                  <select
                    aria-label={`Furcación diente ${fdi}`}
                    value={tooth.furcation}
                    onChange={(e) => onToothChange({ furcation: Number(e.target.value) })}
                    className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    aria-label={`Placa diente ${fdi}`}
                    checked={tooth.plaque}
                    onChange={(e) => onToothChange({ plaque: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  Placa
                </label>
              </>
            )}
          </div>
        </div>

        {/* 6 sitios de sondaje */}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {sites.map(({ site, draft }) => (
            <SitePerioCell
              key={site}
              fdi={fdi}
              site={site}
              draft={draft}
              readOnly={readOnly}
              onChange={(patch) => onSiteChange(site, patch)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SitePerioCell — PD, margen, CAL derivado, BoP, supuración de un sitio
// ---------------------------------------------------------------------------

interface SitePerioCellProps {
  fdi: number;
  site: number;
  draft: SiteDraftState;
  readOnly: boolean;
  onChange: (patch: Partial<SiteDraftState>) => void;
}

function parseNumeric(raw: string): number {
  const value = Number(raw);
  return Number.isNaN(value) ? 0 : value;
}

function SitePerioCell({
  fdi,
  site,
  draft,
  readOnly,
  onChange,
}: SitePerioCellProps): React.ReactElement {
  const label = siteLabel(site);
  const cal = deriveCal(draft.pd_mm, draft.gingival_margin_mm);

  return (
    <div className="space-y-1 rounded-md border bg-muted/20 p-1.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      {readOnly ? (
        <>
          <p className="text-xs font-medium tabular-nums">{draft.pd_mm} mm</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            Margen {draft.gingival_margin_mm} mm
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">CAL {cal} mm</p>
          <div className="flex flex-wrap justify-center gap-1">
            {draft.bop && (
              <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                BoP
              </Badge>
            )}
            {draft.suppuration && (
              <Badge variant="outline" className="px-1 py-0 text-[9px]">
                Sup
              </Badge>
            )}
          </div>
        </>
      ) : (
        <>
          <label className="block">
            <span className="sr-only">{`PD (mm) diente ${fdi} sitio ${label}`}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.5}
              aria-label={`PD (mm) diente ${fdi} sitio ${label}`}
              value={draft.pd_mm}
              onChange={(e) => onChange({ pd_mm: parseNumeric(e.target.value) })}
              className="h-7 w-full rounded border border-input bg-background px-1 text-center text-xs tabular-nums"
            />
          </label>
          <label className="block">
            <span className="sr-only">{`Margen gingival (mm) diente ${fdi} sitio ${label}`}</span>
            <input
              type="number"
              inputMode="decimal"
              min={-15}
              max={15}
              step={0.5}
              aria-label={`Margen gingival (mm) diente ${fdi} sitio ${label}`}
              value={draft.gingival_margin_mm}
              onChange={(e) => onChange({ gingival_margin_mm: parseNumeric(e.target.value) })}
              className="h-7 w-full rounded border border-input bg-background px-1 text-center text-xs tabular-nums"
            />
          </label>
          <p className="text-[10px] text-muted-foreground tabular-nums">CAL {cal} mm</p>
          <div className="flex justify-center gap-1">
            <button
              type="button"
              aria-pressed={draft.bop}
              aria-label={`BoP diente ${fdi} sitio ${label}`}
              onClick={() => onChange({ bop: !draft.bop })}
              className={[
                "rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors",
                draft.bop
                  ? "bg-destructive text-destructive-foreground border-destructive"
                  : "bg-muted/50 text-muted-foreground border-border hover:border-destructive/40",
              ].join(" ")}
            >
              BoP
            </button>
            <button
              type="button"
              aria-pressed={draft.suppuration}
              aria-label={`Supuración diente ${fdi} sitio ${label}`}
              onClick={() => onChange({ suppuration: !draft.suppuration })}
              className={[
                "rounded px-1.5 py-0.5 text-[9px] font-medium border transition-colors",
                draft.suppuration
                  ? "bg-amber-500 text-white border-amber-600"
                  : "bg-muted/50 text-muted-foreground border-border hover:border-amber-400",
              ].join(" ")}
            >
              Sup
            </button>
          </div>
        </>
      )}
    </div>
  );
}
