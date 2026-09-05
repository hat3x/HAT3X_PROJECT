/**
 * Lógica pura del periodontograma (exploración periodontal).
 *
 * Espejo conceptual de `tooth.ts`: sin IO, solo cálculos y validadores sobre
 * las medidas de sondaje periodontal (PD, margen gingival, CAL, BoP).
 *
 * Convención de 6 sitios por diente (estándar BSP/AAP), igual que
 * `perio_site.site` en `supabase/migrations/20260731140000_perio_exam.sql`:
 *   1=MB (mesio-vestibular) · 2=B (vestibular) · 3=DB (disto-vestibular)
 *   4=ML (mesio-lingual/palatino) · 5=L (lingual/palatino) · 6=DL (disto-lingual/palatino)
 */

// ---------------------------------------------------------------------------
// Sitios de sondaje
// ---------------------------------------------------------------------------

/** Orden estándar de los 6 sitios de sondaje por diente. */
export const SITE_ORDER = [1, 2, 3, 4, 5, 6] as const;

/** Abreviatura BSP/AAP de cada código de sitio. */
export const SITE_LABELS: Record<number, string> = {
  1: "MB",
  2: "B",
  3: "DB",
  4: "ML",
  5: "L",
  6: "DL",
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Medida mínima de un sitio periodontal, suficiente para derivar CAL y los
 * roll-ups agregados. No incluye supuración/placa (no participan en los
 * cálculos de v1); las server actions pueden extenderlo si hace falta.
 */
export interface PerioSiteMeasurement {
  fdi_tooth: number;
  site: number;
  pd_mm: number;
  gingival_margin_mm: number;
  bop: boolean;
}

/** Roll-ups agregados de una exploración periodontal (o de un subconjunto de sitios). */
export interface PerioRollups {
  /** % de sitios con sangrado al sondaje (BoP), redondeado al entero más cercano. */
  bopPercent: number;
  /** Mayor profundidad de sondaje (PD) registrada. */
  worstPd: number;
  /** Media del CAL (Nivel de Inserción Clínica) derivado por sitio. */
  meanCal: number;
}

/** Estadio periodontal (clasificación AAP 2017, simplificada a v1). */
export type PerioStage = "I" | "II" | "III" | "IV";

// ---------------------------------------------------------------------------
// CAL — Nivel de Inserción Clínica
// ---------------------------------------------------------------------------

/**
 * CAL (Clinical Attachment Level) = PD - margen gingival.
 * Espeja la columna GENERATED `perio_site.cal_mm` de la migración.
 */
export function deriveCal(pd_mm: number, gingival_margin_mm: number): number {
  return pd_mm - gingival_margin_mm;
}

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

/** Profundidad de sondaje: rango clínico 0-20 mm. */
export function isValidPd(n: number): boolean {
  return n >= 0 && n <= 20;
}

/**
 * Margen gingival respecto al CEJ: rango -15 a 15 mm (validación de app).
 *
 * NOTA: el CHECK de BD (`perio_site_gingival_margin_valid`) es más estricto,
 * -15 a 10. Este validador de app sigue el rango indicado en el brief de la
 * tarea; ver reporte final para el detalle de la discrepancia.
 */
export function isValidMargin(n: number): boolean {
  return n >= -15 && n <= 15;
}

/** Código de sitio de sondaje: 1-6 (estándar BSP/AAP de 6 sitios/diente). */
export function isValidSite(n: number): boolean {
  return n >= 1 && n <= 6;
}

// ---------------------------------------------------------------------------
// Roll-ups agregados
// ---------------------------------------------------------------------------

/**
 * Calcula los indicadores agregados de una exploración (o de un subconjunto
 * de sitios): % de BoP, la peor profundidad de sondaje y el CAL medio.
 * Con lista vacía devuelve todo a cero (sin dividir por cero).
 */
export function computePerioRollups(
  sites: readonly PerioSiteMeasurement[],
): PerioRollups {
  if (sites.length === 0) {
    return { bopPercent: 0, worstPd: 0, meanCal: 0 };
  }

  const bopCount = sites.filter((s) => s.bop).length;
  const worstPd = Math.max(...sites.map((s) => s.pd_mm));
  const calSum = sites.reduce(
    (sum, s) => sum + deriveCal(s.pd_mm, s.gingival_margin_mm),
    0,
  );

  return {
    bopPercent: Math.round((100 * bopCount) / sites.length),
    worstPd,
    meanCal: calSum / sites.length,
  };
}

// ---------------------------------------------------------------------------
// Estadio periodontal (AAP 2017, simplificado)
// ---------------------------------------------------------------------------

/**
 * Deriva el estadio periodontal a partir del CAL máximo (peor sitio/diente).
 *
 * Clasificación AAP 2017 completa: 'I' <=2mm, 'II' 3-4mm, 'III' >=5mm CON
 * pérdida dentaria <=4 dientes, 'IV' >=5mm CON pérdida dentaria >=5 dientes
 * y/o necesidad de rehabilitación compleja. v1 no modela señales de
 * complejidad (pérdida dentaria, colapso oclusal, etc.), así que CAL >=5
 * devuelve 'III'; 'IV' queda reservado para cuando se incorporen esas señales.
 */
export function perioStage(maxCal: number): PerioStage {
  if (maxCal <= 2) return "I";
  if (maxCal <= 4) return "II";
  return "III";
}
