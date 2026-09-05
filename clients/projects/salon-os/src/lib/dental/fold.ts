/**
 * "Time travel" del odontograma: reconstruye el estado por diente vigente en
 * una fecha pasada, a partir del historial event-sourced append-only de
 * `odontogram_findings`.
 *
 * DESVIACIÓN DE ESQUEMA: el brief original de esta tarea asumía columnas
 * `detected_at`/`resolved_at` en `OdontogramFinding`. El esquema REAL
 * (`src/types/database.ts`, tabla `odontogram_findings`) no las tiene — solo
 * `recorded_at`. Al ser una tabla append-only (ver `odontogram.ts`), un
 * `recorded_at` más reciente del mismo `fdi_tooth` supersede implícitamente
 * al evento anterior: no hace falta un `resolved_at` explícito. Por eso
 * `foldFindingsAsOf` selecciona, por diente, el finding con mayor
 * `recorded_at` tal que `recorded_at <= isoDate`. Si ninguno cumple, el
 * diente no aparece en el mapa — igual semántica que pedía el brief.
 */
import type { CurrentToothState } from "@/lib/queries/odontogram";
import type { OdontogramFinding } from "@/types/database";

/**
 * Reconstruye el mapa fdi_tooth → CurrentToothState vigente en `isoDate`.
 *
 * Por cada diente, elige el finding con el `recorded_at` más reciente que no
 * sea posterior a `isoDate`. Si el diente no tiene ningún finding anterior o
 * igual a esa fecha, no aparece en el mapa resultante.
 */
export function foldFindingsAsOf(
  findings: readonly OdontogramFinding[],
  isoDate: string,
): Map<number, CurrentToothState> {
  const map = new Map<number, CurrentToothState>();

  for (const f of findings) {
    if (f.recorded_at > isoDate) continue;

    const current = map.get(f.fdi_tooth);
    if (current === undefined || f.recorded_at > current.recorded_at) {
      map.set(f.fdi_tooth, {
        fdi_tooth: f.fdi_tooth,
        tooth_state: f.tooth_state,
        affected_surfaces: f.surfaces,
        finding_type: f.finding_type,
        recorded_at: f.recorded_at,
      });
    }
  }

  return map;
}
