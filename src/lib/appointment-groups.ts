// Agrupación por PROFESIONAL de la agenda diaria (vista de administración owner/manager).
// Parte PURA y testeable: recibe el modelo de vista ya cargado (`AppointmentListItem[]` de
// la capa de datos, sub-2) y NO toca red ni DOM. Reutiliza el comparador/orden de
// `appointments.ts` para que el orden dentro de cada profesional sea idéntico al que ya
// devuelve la consulta (una única fuente de verdad para el orden temporal).
//
// ⛔ SIN DISPONIBILIDAD EN CLIENTE: aquí solo se PARTICIONA y REORDENA lo que el servidor
// ya devolvió. No se derivan huecos libres/ocupados ni se calculan solapes de tramos: eso
// es responsabilidad del servidor (mismo principio que toda la capa de citas).

import {
  sortByStartsAt,
  type AppointmentListItem,
  type AppointmentStatus,
} from '@/lib/appointments';

/** Cabecera de profesional de un grupo (embed aplanado de la cita). */
export interface GroupProfessional {
  id: string;
  fullName: string;
  /** Color de marca del profesional (hex) para el acento de su sección; null si no tiene. */
  color: string | null;
}

/** Un profesional del salón con sus citas del día, ya ordenadas por hora de inicio. */
export interface ProfessionalGroup {
  /** `professional_id` de la cita (SIEMPRE presente aunque el embed venga null por RLS). */
  professionalId: string;
  /** Datos del profesional si el embed llegó; null si RLS lo ocultó (defensivo). */
  professional: GroupProfessional | null;
  /** Citas de ese profesional ese día, ascendente por `starts_at`. */
  appointments: AppointmentListItem[];
}

/**
 * Etiqueta legible (es-ES) de cada estado de cita (enum `appointment_status`). Pura y
 * exhaustiva sobre el enum ⇒ testeable sin UI y a prueba de nuevos estados (un valor nuevo
 * en el enum obliga a añadir su etiqueta o el tipo deja de compilar).
 */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

/** Texto neutro para un grupo cuyo profesional no pudo resolverse (embed null). */
export const UNKNOWN_PROFESSIONAL_LABEL = 'Sin profesional asignado';

/**
 * Nombre para mostrar de un grupo (se usa para pintar y para ordenar). Cae a un texto
 * neutro cuando el embed del profesional no llegó, de modo que ni el orden ni la UI se
 * rompen ante una fila sin profesional.
 */
export function professionalDisplayName(group: ProfessionalGroup): string {
  const name = group.professional?.fullName.trim();
  return name && name.length > 0 ? name : UNKNOWN_PROFESSIONAL_LABEL;
}

// Colación es-ES insensible a mayúsculas/acentos para ordenar nombres de forma natural
// ("Álvaro" junto a "Alvaro", "ángela" antes de "Bruno"). Se crea una sola vez.
const NAME_COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

function toGroupProfessional(
  professional: NonNullable<AppointmentListItem['professional']>,
): GroupProfessional {
  return {
    id: professional.id,
    fullName: professional.fullName,
    color: professional.color ?? null,
  };
}

/**
 * Particiona las citas del día por profesional y devuelve los grupos LISTOS para pintar:
 *  · dentro de cada grupo, orden ascendente por `starts_at` (reusa `sortByStartsAt`, sub-2);
 *  · los grupos se ordenan alfabéticamente por nombre de profesional (locale es, sin
 *    distinguir mayúsculas/acentos), y los de profesional desconocido (embed null) al final;
 *  · desempate estable por `professionalId` para que el orden sea determinista.
 *
 * Puro y NO mutante: no altera el array de entrada ni sus elementos.
 */
export function groupAppointmentsByProfessional(
  items: AppointmentListItem[],
): ProfessionalGroup[] {
  const byProfessional = new Map<string, ProfessionalGroup>();

  for (const item of items) {
    let group = byProfessional.get(item.professionalId);
    if (!group) {
      group = {
        professionalId: item.professionalId,
        professional: item.professional ? toGroupProfessional(item.professional) : null,
        appointments: [],
      };
      byProfessional.set(item.professionalId, group);
    } else if (!group.professional && item.professional) {
      // Si la primera cita del grupo no traía el embed pero una posterior sí, lo completamos.
      group.professional = toGroupProfessional(item.professional);
    }
    group.appointments.push(item);
  }

  const groups = Array.from(byProfessional.values());
  for (const group of groups) {
    // Array nuevo por grupo (sortByStartsAt no muta): reafirma el orden temporal server-side.
    group.appointments = sortByStartsAt(group.appointments);
  }

  return groups.sort((a, b) => {
    const aKnown = a.professional !== null;
    const bKnown = b.professional !== null;
    if (aKnown !== bKnown) return aKnown ? -1 : 1; // profesionales desconocidos al final
    const byName = NAME_COLLATOR.compare(professionalDisplayName(a), professionalDisplayName(b));
    if (byName !== 0) return byName;
    return a.professionalId < b.professionalId ? -1 : a.professionalId > b.professionalId ? 1 : 0;
  });
}

/**
 * Nº total de citas repartidas en los grupos. Azúcar para el resumen de la cabecera
 * (evita recalcular el `flat().length` en el componente).
 */
export function countAppointments(groups: ProfessionalGroup[]): number {
  return groups.reduce((total, group) => total + group.appointments.length, 0);
}
