/**
 * Esquemas Zod compartidos por la reserva pública (validación en el Route
 * Handler) y por el formulario del cliente. Una sola fuente de verdad para el
 * contrato del endpoint público.
 */
import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Query de disponibilidad: GET .../availability?serviceId=&date=&professionalId= */
export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(DATE_RE, "Fecha no válida (YYYY-MM-DD)"),
  // "any" o vacío = cualquier profesional que preste el servicio.
  professionalId: z
    .union([z.string().uuid(), z.literal("any"), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === "any" ? undefined : v)),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

/** Datos de contacto del cliente en la reserva pública. */
export const bookingCustomerSchema = z.object({
  fullName: z.string().trim().min(2, "Indica tu nombre").max(200),
  email: z.string().trim().email("Email no válido").max(255).optional().or(z.literal("")),
  phone: z.string().trim().min(6, "Teléfono no válido").max(30),
  notes: z.string().trim().max(1000).optional(),
  marketingConsent: z.boolean().optional().default(false),
});

/** Cuerpo del POST de creación de reserva pública. */
export const createBookingSchema = z
  .object({
    serviceId: z.string().uuid(),
    // Profesional concreto o "any" (se asigna uno disponible en el servidor).
    professionalId: z.union([z.string().uuid(), z.literal("any")]),
    // Inicio del hueco elegido (instante UTC en ISO).
    startsAt: z.string().datetime({ offset: true }),
    customer: bookingCustomerSchema,
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Normaliza el email opcional a `string | null` para la BD. */
export function normalizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}
