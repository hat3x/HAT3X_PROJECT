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

/**
 * Query del endpoint PÚBLICO de disponibilidad, que extiende {@link availabilityQuerySchema}
 * de forma ADITIVA con `view` (opt-in) para elegir la forma de la respuesta:
 *
 *   · `view` ausente o `"free"` → vista por defecto `{ slots }` (solo huecos libres).
 *     Contrato intacto para la app de cliente y el panel.
 *   · `view="day"` → rejilla completa `{ daySlots }` (jornada entera, available + reason).
 *
 * La rejilla es PER-PROFESIONAL (pinta la columna de agenda de UN profesional), así que
 * `view="day"` EXIGE un `professionalId` concreto: se valida de forma cruzada aquí para
 * devolver un 400 claro y que el handler no tenga que defenderse de un `professionalId`
 * ausente en la rama de rejilla. La recepción sigue usando el schema base sin `view`, de
 * modo que su contrato de entrada no cambia.
 */
export const publicAvailabilityQuerySchema = availabilityQuerySchema
  .extend({
    view: z.enum(["free", "day"]).optional().default("free"),
  })
  .superRefine((val, ctx) => {
    // Tras el transform, `professionalId === undefined` significa "cualquiera": no vale
    // para una rejilla, que es de un profesional concreto.
    if (val.view === "day" && val.professionalId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["professionalId"],
        message: "La rejilla diaria (view=day) requiere un profesional concreto.",
      });
    }
  });

export type PublicAvailabilityQuery = z.infer<typeof publicAvailabilityQuerySchema>;

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
