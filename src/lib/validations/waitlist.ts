import { z } from "zod";

import { TIME_PATTERN } from "@/lib/validations/schedule";

/**
 * Validación de la lista de espera (B3).
 *
 * Modelo: la persona apunta QUÉ aceptaría, y todo lo que deja en blanco
 * significa "me da igual" — no "sin datos". Quien no elige profesional acepta a
 * cualquiera, y quien no marca días acepta cualquier día. Eso los convierte en
 * los candidatos más fáciles de encajar, así que el esquema tiene que dejarlos
 * pasar sin protestar en vez de exigirles que rellenen algo.
 *
 * Se reutiliza `TIME_PATTERN` de `schedule.ts`: si algún día cambia el formato de
 * hora del proyecto, cambia en un sitio.
 */

const optionalTime = z
  .string()
  .regex(TIME_PATTERN, "Introduce una hora válida (HH:MM)")
  .nullable()
  .optional();

export const waitlistEntrySchema = z
  .object({
    customerId: z.string().uuid("Elige un cliente"),

    /** `null` = le vale cualquier servicio. */
    serviceId: z.string().uuid().nullable().optional(),
    /** `null` = le da igual el profesional. */
    professionalId: z.string().uuid().nullable().optional(),

    /** 0=domingo … 6=sábado. Vacío = cualquier día. */
    weekdays: z
      .array(z.number().int().min(0, "Día no válido").max(6, "Día no válido"))
      .default([]),

    fromTime: optionalTime,
    toTime: optionalTime,

    priority: z.number().int().min(0).max(100).default(0),
    notes: z.string().trim().max(500).nullable().optional(),

    /** Hasta cuándo tiene sentido llamar. ISO-8601. */
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine(
    (entry) => entry.fromTime == null || entry.toTime == null || entry.toTime > entry.fromTime,
    {
      // Las horas van cero-rellenadas, así que comparar cadenas equivale a
      // comparar horas. Una franja invertida no dejaría pasar ningún hueco y
      // nadie entendería por qué: mejor cortarla al apuntar.
      message: "La hora de fin tiene que ser posterior a la de inicio",
      path: ["toTime"],
    },
  );

export type WaitlistEntryInput = z.infer<typeof waitlistEntrySchema>;

/** Estados válidos, espejo del enum `public.waitlist_status`. */
export const waitlistStatusSchema = z.enum(["esperando", "avisado", "agendado", "descartado"]);
