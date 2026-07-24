/**
 * Tipos del contrato de la API pública de reserva. Sin dependencias de
 * servidor: los comparten el Route Handler y el asistente de reserva (cliente).
 */
import type { DaySlotReason } from "@/lib/booking/availability";

export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  address: string | null;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
}

export interface PublicProfessional {
  id: string;
  fullName: string;
  color: string | null;
}

/** Respuesta de arranque: salón + catálogo + qué profesional presta qué. */
export interface BookingBootstrap {
  salon: PublicSalon;
  services: PublicService[];
  professionals: PublicProfessional[];
  /** serviceId → lista de professionalId que lo prestan. */
  serviceProfessionals: Record<string, string[]>;
}

/** Hueco reservable devuelto por el endpoint de disponibilidad. */
export interface PublicSlot {
  startsAt: string;
  endsAt: string;
  professionalId: string;
}

export interface AvailabilityResponse {
  slots: PublicSlot[];
}

/**
 * Slot de la REJILLA diaria (vista `view=day` del endpoint de disponibilidad): es un
 * paso del horario de un profesional CONCRETO, etiquetado como reservable o no, con su
 * `professionalId` adjunto para pintar su columna de agenda. A diferencia de
 * {@link PublicSlot} (solo libres), aquí vienen TODOS los pasos de la jornada.
 *
 * INVARIANTE (sub-1): los `available: true` coinciden EXACTAMENTE con los
 * {@link PublicSlot} de la vista por defecto (mismo motor). Un consumidor que solo
 * quiera libres puede usar la vista por defecto o filtrar `daySlots` por
 * `available === true`.
 */
export interface PublicDaySlot {
  startsAt: string;
  endsAt: string;
  /** `true` si el hueco es reservable. */
  available: boolean;
  /** Motivo de indisponibilidad; ausente cuando `available` es `true`. */
  reason?: DaySlotReason;
  /** Profesional al que pertenece esta columna de agenda. */
  professionalId: string;
}

/**
 * Respuesta de la vista de REJILLA (`view=day`): la jornada COMPLETA de un profesional
 * (libres y no-libres). Forma versionada y ADITIVA: la vista por defecto sigue
 * devolviendo {@link AvailabilityResponse} (`{ slots }`), de modo que los consumidores
 * actuales (app de cliente y panel) no se ven afectados.
 */
export interface DayAvailabilityResponse {
  daySlots: PublicDaySlot[];
}

/**
 * Datos con los que precargar el paso «Tus datos» del asistente cuando quien reserva
 * es un cliente AUTENTICADO con ficha en ESTE salón (lectura self, sub-6). Es el
 * reflejo, ya mapeado a la forma del formulario, de su ficha (`customers`): así no
 * reescribe lo que el salón ya sabe de él. Gracias a la identidad por teléfono (sub-1),
 * reservar con este teléfono REUTILIZA su ficha en vez de duplicarla.
 *
 * Solo campos de PERFIL (nombre, teléfono, email, consentimiento). Las `notes` NO se
 * precargan: son de la CITA concreta, no del perfil. Cadenas siempre presentes
 * (`""` si el campo está vacío en la ficha) para alimentar inputs controlados sin
 * pelearse con `null`. Serializable: viaja del Server Component al asistente cliente.
 */
export interface BookingPrefill {
  fullName: string;
  phone: string;
  email: string;
  marketingConsent: boolean;
}

/** Confirmación tras crear la reserva. */
export interface BookingConfirmation {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  professionalName: string;
  serviceName: string;
  salonName: string;
}

/** Forma de error homogénea de la API pública. */
export interface ApiError {
  error: string;
}
