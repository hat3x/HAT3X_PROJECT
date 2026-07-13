import { z } from "zod";

/**
 * Esquemas de validación de horarios del profesional.
 *
 * Se usan tanto en los Server Actions (validación de confianza en servidor)
 * como en los formularios cliente (para tipar y validar antes de enviar).
 *
 * Modelo de dominio:
 * - **Horario semanal** (`professional_schedules`): tramos recurrentes por día
 *   de la semana. Puede haber varias filas por día → turno de mañana y tarde.
 *   `weekday` sigue la convención de `Date.getDay()`: 0=domingo … 6=sábado
 *   (coherente con `weekdayOfLocalDate` y `WEEKDAY_LABELS` de booking).
 * - **Excepciones** (`schedule_exceptions`): un día concreto en el que el
 *   profesional libra (`is_available=false`) o trabaja en horario especial
 *   (`is_available=true` con `start_time`/`end_time`).
 *
 * Las horas se manejan en formato `HH:MM` (24 h). Al estar cero-rellenadas, la
 * comparación lexicográfica (`>`, `<`) coincide con la cronológica, de modo que
 * la regla `end_time > start_time` se valida sin parsear a `Date`.
 */

/** Patrón de hora 24 h `HH:MM` (00:00 … 23:59). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Patrón de fecha local `YYYY-MM-DD`. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Días de la semana en orden de presentación (lunes primero). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Hora obligatoria en formato `HH:MM`. */
const timeString = z
  .string({ required_error: "La hora es obligatoria" })
  .regex(TIME_PATTERN, "Introduce una hora válida (HH:MM)");

/**
 * Un tramo horario de un día de la semana. La regla central del dominio:
 * la hora de fin debe ser posterior a la de inicio.
 */
export const scheduleSlotSchema = z
  .object({
    weekday: z
      .number({ required_error: "Día no válido" })
      .int()
      .min(0, "Día no válido")
      .max(6, "Día no válido"),
    start_time: timeString,
    end_time: timeString,
  })
  .refine((slot) => slot.end_time > slot.start_time, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["end_time"],
  });

export type ScheduleSlotInput = z.input<typeof scheduleSlotSchema>;

/**
 * Horario semanal completo de un profesional. Se valida como una sola unidad
 * porque el guardado reemplaza todos los tramos del profesional a la vez.
 *
 * Además de `end_time > start_time` (heredado de `scheduleSlotSchema`), se
 * comprueba que los tramos de un mismo día no se solapen entre sí.
 */
export const weeklyScheduleSchema = z
  .object({
    professional_id: z.string().uuid("Profesional no válido"),
    slots: z.array(scheduleSlotSchema),
  })
  .superRefine((value, ctx) => {
    const byWeekday = new Map<
      number,
      { index: number; start: string; end: string }[]
    >();
    value.slots.forEach((slot, index) => {
      const current = byWeekday.get(slot.weekday) ?? [];
      current.push({ index, start: slot.start_time, end: slot.end_time });
      byWeekday.set(slot.weekday, current);
    });

    for (const daySlots of byWeekday.values()) {
      const ordered = [...daySlots].sort((a, b) =>
        a.start.localeCompare(b.start),
      );
      for (let i = 1; i < ordered.length; i += 1) {
        const previous = ordered[i - 1]!;
        const currentSlot = ordered[i]!;
        if (currentSlot.start < previous.end) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Los tramos de un mismo día no pueden solaparse",
            path: ["slots", currentSlot.index, "start_time"],
          });
        }
      }
    }
  });

/** Valores de entrada del horario semanal (lo que envía el formulario). */
export type WeeklyScheduleInput = z.input<typeof weeklyScheduleSchema>;

/** Hora opcional que normaliza cadena vacía a `undefined`. */
const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value));

/** Motivo opcional; vacío → `undefined` (→ `null` en BD). */
const optionalReason = z
  .string()
  .trim()
  .max(200, "El motivo no puede superar 200 caracteres")
  .optional()
  .transform((value) => (value === undefined || value === "" ? undefined : value));

/**
 * Excepción de horario para un día concreto.
 *
 * - `is_available=false` → el profesional libra ese día; las horas se ignoran.
 * - `is_available=true`  → horario especial; `start_time`/`end_time` son
 *   obligatorias y debe cumplirse `end_time > start_time`.
 */
export const exceptionSchema = z
  .object({
    professional_id: z.string().uuid("Profesional no válido"),
    exception_date: z
      .string({ required_error: "Selecciona una fecha" })
      .regex(DATE_PATTERN, "Selecciona una fecha válida"),
    is_available: z.boolean().default(false),
    start_time: optionalTime,
    end_time: optionalTime,
    reason: optionalReason,
  })
  .superRefine((value, ctx) => {
    if (!value.is_available) {
      return;
    }
    for (const field of ["start_time", "end_time"] as const) {
      const raw = value[field];
      if (raw === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica el horario especial de inicio y fin",
          path: [field],
        });
      } else if (!TIME_PATTERN.test(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Introduce una hora válida (HH:MM)",
          path: [field],
        });
      }
    }
    if (
      value.start_time !== undefined &&
      value.end_time !== undefined &&
      TIME_PATTERN.test(value.start_time) &&
      TIME_PATTERN.test(value.end_time) &&
      value.end_time <= value.start_time
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora de fin debe ser posterior a la de inicio",
        path: ["end_time"],
      });
    }
  });

/** Valores de entrada de una excepción (lo que envía el formulario). */
export type ExceptionInput = z.input<typeof exceptionSchema>;
