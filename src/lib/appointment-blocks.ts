// Modelo de las 3 FASES de una cita (aplicación · exposición · post-exposición) — parte PURA
// y testeable. La tabla `appointment_blocks` (auditoría HAT3X-031, Hallazgo 3) guarda UNA fila
// por tramo con:
//   · `phase`          → el nombre del tramo (string libre en la BD, no enum),
//   · `occupied_range` → la VENTANA temporal en la que el profesional está OCUPADO en ese tramo.
//
// Este módulo solo LEE y PRESENTA lo que el servidor ya calculó. NO deriva disponibilidad ni
// inventa reglas de solape: el patrón de peluquería/estética (durante la "exposición" el cliente
// espera y el profesional atiende a otra persona) hace que dos citas se SOLAPEN de forma legítima.
// Por eso pintamos las ventanas `occupied_range` tal cual las trae la BD, sin marcarlas como error.
//
// ⛔ SIN DISPONIBILIDAD EN CLIENTE: coherente con `appointments.ts`, aquí jamás se computa
// free/busy. `occupied_range` viene RESUELTO del servidor; nosotros solo lo parseamos y lo
// mostramos. Ante un rango que no sabemos parsear, degradamos a "sin ventana" (la UI muestra la
// cita tal cual), nunca a un error.

/**
 * Clave canónica de fase. `phase` es un `string` LIBRE en la BD (no un enum), así que
 * normalizamos a este conjunto cerrado para etiquetar/ordenar de forma estable. Cualquier valor
 * no reconocido cae en `other` (se muestra con su texto crudo, sin romper el render).
 */
export type AppointmentPhaseKey = 'application' | 'exposure' | 'post_exposure' | 'other';

/** Etiqueta es-ES de cada fase conocida (única fuente de verdad del texto de los tramos). */
export const PHASE_LABELS: Record<Exclude<AppointmentPhaseKey, 'other'>, string> = {
  application: 'Aplicación',
  exposure: 'Exposición',
  post_exposure: 'Post-exposición',
};

/** Orden cronológico natural de las fases (para ordenar los tramos de una misma cita). */
const PHASE_ORDER: Record<AppointmentPhaseKey, number> = {
  application: 0,
  exposure: 1,
  post_exposure: 2,
  other: 3,
};

/**
 * Normaliza el `phase` crudo de la BD a una clave canónica. Tolerante a variantes de formato
 * (`post_exposure`, `post-exposure`, `postExposure`, `Post exposición`…). `post` se comprueba
 * ANTES que `exposure` para que "post_exposure" no case como "exposure".
 */
export function normalizePhase(phase: string): AppointmentPhaseKey {
  // `normalize('NFD')` descompone las vocales acentuadas en letra base + marca combinante; el
  // filtro `[^a-z0-9]` de después descarta esas marcas (y guiones/espacios). Así "Aplicación"
  // queda "aplicacion" (y no "aplicacin"), y se compara solo con caracteres ASCII.
  const key = phase
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
  if (key.includes('application') || key.includes('aplicacion')) return 'application';
  if (key.includes('post')) return 'post_exposure';
  if (key.includes('exposure') || key.includes('exposicion')) return 'exposure';
  return 'other';
}

/** Capitaliza la primera letra (para el fallback de fases desconocidas). */
function capitalizeFirst(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Etiqueta legible (es-ES) de un `phase`. Las fases conocidas usan `PHASE_LABELS`; una fase
 * desconocida se muestra con su texto crudo capitalizado (nunca vacío) para no perder información.
 */
export function phaseLabel(phase: string): string {
  const key = normalizePhase(phase);
  if (key === 'other') {
    const trimmed = phase.trim();
    return trimmed.length > 0 ? capitalizeFirst(trimmed) : 'Tramo';
  }
  return PHASE_LABELS[key];
}

/** Ventana temporal ocupada (instantes ISO) parseada desde `occupied_range`. */
export interface OccupiedRange {
  /** Inicio de la ventana ocupada (ISO 8601). */
  startsAt: string;
  /** Fin de la ventana ocupada (ISO 8601). */
  endsAt: string;
}

/**
 * Normaliza un límite de rango de Postgres a ISO 8601. Postgres serializa `tstzrange` como
 * `2026-07-22 09:00:00+00`: cambia el espacio por `T` y completa el offset corto (`+00` → `+00:00`)
 * para que `Date` lo parsee de forma fiable en todos los motores. Devuelve `null` si no es fecha.
 */
function boundToIso(bound: string): string | null {
  const trimmed = bound.trim().replace(/^"|"$/g, '');
  if (trimmed === '') return null; // límite infinito/ausente ⇒ sin ventana
  const withT = trimmed.replace(' ', 'T');
  // Completa un offset de solo horas (`+00`, `-05`) a `+00:00` / `-05:00`.
  const normalized = withT.replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Parsea `occupied_range` (tipado `unknown` en los tipos generados) a una `OccupiedRange`.
 * Robusto y DEFENSIVO: acepta la forma canónica de Postgres (`["lo","hi")`, con o sin comillas,
 * corchetes `[]`/`()` de inclusividad) y, por si acaso, una forma de objeto (`{ start, end }` o
 * `{ lower, upper }`). Ante cualquier duda (rango `empty`, límite infinito, texto no reconocido)
 * devuelve `null` para que la UI degrade a "cita sin desglose de tramos", nunca a un error.
 */
export function parseOccupiedRange(value: unknown): OccupiedRange | null {
  // Forma de objeto (defensiva: algún día podría llegar ya estructurado).
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const lower = obj.start ?? obj.lower ?? obj.startsAt ?? obj.from;
    const upper = obj.end ?? obj.upper ?? obj.endsAt ?? obj.to;
    if (typeof lower === 'string' && typeof upper === 'string') {
      const startsAt = boundToIso(lower);
      const endsAt = boundToIso(upper);
      return startsAt && endsAt ? { startsAt, endsAt } : null;
    }
    return null;
  }

  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '' || raw.toLowerCase() === 'empty') return null;

  // Quita los corchetes de inclusividad `[ ( … ] )` y separa por la coma de nivel superior.
  const inner = raw.replace(/^[[(]/, '').replace(/[\])]$/, '');
  const match = inner.match(/^\s*("[^"]*"|[^,]*)\s*,\s*("[^"]*"|[^,]*)\s*$/);
  if (!match) return null;

  const startsAt = boundToIso(match[1]);
  const endsAt = boundToIso(match[2]);
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}

/** Fila CRUDA de `appointment_blocks` (forma exacta de `APPOINTMENT_BLOCKS_SELECT`). */
export interface AppointmentBlockRow {
  id: string;
  salon_id: string;
  appointment_id: string;
  professional_id: string;
  phase: string;
  occupied_range: unknown;
}

/** Modelo de vista de un tramo: fase normalizada + etiqueta + ventana ocupada (o null). */
export interface AppointmentBlock {
  id: string;
  salonId: string;
  appointmentId: string;
  professionalId: string;
  /** Valor crudo de `phase` tal cual la BD (para depurar / fases desconocidas). */
  phase: string;
  /** Fase normalizada a clave canónica (para ordenar/estilar). */
  phaseKey: AppointmentPhaseKey;
  /** Etiqueta es-ES de la fase (lista para pintar). */
  phaseLabel: string;
  /** Ventana ocupada [inicio, fin) parseada; null si el rango no era parseable. */
  occupied: OccupiedRange | null;
}

/**
 * SELECT de PostgREST para los tramos. Se acota por `salon_id` + `appointment_id` en la consulta
 * (`appointment-blocks-queries.ts`); aquí solo se declara la forma de la fila.
 */
export const APPOINTMENT_BLOCKS_SELECT: string = `
  id,
  salon_id,
  appointment_id,
  professional_id,
  phase,
  occupied_range
`;

/** Mapea una fila cruda al modelo de vista (parsea el rango y normaliza la fase). Puro. */
export function mapAppointmentBlockRow(row: AppointmentBlockRow): AppointmentBlock {
  return {
    id: row.id,
    salonId: row.salon_id,
    appointmentId: row.appointment_id,
    professionalId: row.professional_id,
    phase: row.phase,
    phaseKey: normalizePhase(row.phase),
    phaseLabel: phaseLabel(row.phase),
    occupied: parseOccupiedRange(row.occupied_range),
  };
}

/** Mapea un lote de filas crudas (tolera null/undefined ⇒ lista vacía). */
export function mapAppointmentBlockRows(
  rows: AppointmentBlockRow[] | null | undefined,
): AppointmentBlock[] {
  return (rows ?? []).map(mapAppointmentBlockRow);
}

/**
 * Comparador de tramos: primero por fase (aplicación → exposición → post → otras) y, a igualdad,
 * por inicio de la ventana ocupada (los que no tienen ventana quedan al final de su fase). Estable
 * por `id` para un orden determinista.
 */
export function compareBlocks(a: AppointmentBlock, b: AppointmentBlock): number {
  const byPhase = PHASE_ORDER[a.phaseKey] - PHASE_ORDER[b.phaseKey];
  if (byPhase !== 0) return byPhase;

  const ta = a.occupied ? new Date(a.occupied.startsAt).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.occupied ? new Date(b.occupied.startsAt).getTime() : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Agrupa los tramos por `appointment_id` y, dentro de cada cita, los ordena con `compareBlocks`.
 * Devuelve un `Map` (clave = appointment_id) LISTO para que la UI pinte el desglose de fases de
 * cada cita. Puro y NO mutante.
 */
export function groupBlocksByAppointment(
  blocks: AppointmentBlock[],
): Map<string, AppointmentBlock[]> {
  const byAppointment = new Map<string, AppointmentBlock[]>();
  for (const block of blocks) {
    const existing = byAppointment.get(block.appointmentId);
    if (existing) {
      existing.push(block);
    } else {
      byAppointment.set(block.appointmentId, [block]);
    }
  }
  for (const list of byAppointment.values()) {
    list.sort(compareBlocks);
  }
  return byAppointment;
}
