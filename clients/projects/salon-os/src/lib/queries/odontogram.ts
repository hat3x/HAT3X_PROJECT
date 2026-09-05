import { createClient } from "@/lib/supabase/client";
import type { DentalToothState, OdontogramFinding } from "@/types/database";

// ---------------------------------------------------------------------------
// Cache key factory
// ---------------------------------------------------------------------------

export const odontogramKeys = {
  all: (salonId: string) => ["odontogram", salonId] as const,
  findings: (salonId: string, clinicalRecordId: string) =>
    [...odontogramKeys.all(salonId), "findings", clinicalRecordId] as const,
};

// ---------------------------------------------------------------------------
// Derived type: current state per tooth
// ---------------------------------------------------------------------------

/**
 * Current state of one tooth, derived from the most recent odontogram_findings
 * row for that fdi_tooth. Built by `deriveCurrentStates()` after fetch.
 */
export interface CurrentToothState {
  fdi_tooth: number;
  tooth_state: DentalToothState;
  /** Surfaces from the most recent finding. Empty = whole-tooth event. */
  affected_surfaces: string[];
  finding_type: string;
  recorded_at: string;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Returns all odontogram findings for a patient's clinical record, ordered by
 * recorded_at DESC so the first row per tooth is always the most recent state.
 */
export async function fetchOdontogramFindings(
  salonId: string,
  clinicalRecordId: string,
): Promise<OdontogramFinding[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("odontogram_findings")
    .select("*")
    .eq("salon_id", salonId)
    .eq("clinical_record_id", clinicalRecordId)
    .order("recorded_at", { ascending: false });

  if (error !== null) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Derive current state map
// ---------------------------------------------------------------------------

/**
 * Reduces the finding list (DESC by recorded_at) into a map of
 * fdi_tooth → CurrentToothState.
 *
 * Because the findings are sorted most-recent-first, the first occurrence of
 * each fdi_tooth is the current state — subsequent rows are historical.
 */
export function deriveCurrentStates(
  findings: OdontogramFinding[],
): Map<number, CurrentToothState> {
  const map = new Map<number, CurrentToothState>();
  for (const f of findings) {
    if (!map.has(f.fdi_tooth)) {
      map.set(f.fdi_tooth, {
        fdi_tooth:         f.fdi_tooth,
        tooth_state:       f.tooth_state,
        affected_surfaces: f.surfaces,
        finding_type:      f.finding_type,
        recorded_at:       f.recorded_at,
      });
    }
  }
  return map;
}
