/**
 * Tipos del contrato de la API pública de reserva. Sin dependencias de
 * servidor: los comparten el Route Handler y el asistente de reserva (cliente).
 */

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
