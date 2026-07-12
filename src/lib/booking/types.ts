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
