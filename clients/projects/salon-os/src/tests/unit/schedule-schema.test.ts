/**
 * Tests unitarios de los esquemas de validación de horarios
 * (`scheduleSlotSchema`, `weeklyScheduleSchema`, `exceptionSchema`).
 *
 * La regla central del dominio que se verifica aquí es `end_time > start_time`:
 * como las horas van en formato `HH:MM` cero-rellenado, la comparación
 * lexicográfica coincide con la cronológica. También se cubre el solapamiento
 * de tramos del mismo día y la validación condicional de las excepciones con
 * horario especial.
 */
import { describe, it, expect } from "vitest";

import {
  scheduleSlotSchema,
  weeklyScheduleSchema,
  exceptionSchema,
} from "@/lib/validations/schedule";

const PRO_ID = "11111111-1111-1111-1111-111111111111";

describe("scheduleSlotSchema — end_time > start_time", () => {
  it("acepta un tramo con fin posterior al inicio", () => {
    const result = scheduleSlotSchema.safeParse({
      weekday: 1,
      start_time: "09:00",
      end_time: "13:00",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un tramo con fin igual al inicio", () => {
    const result = scheduleSlotSchema.safeParse({
      weekday: 1,
      start_time: "09:00",
      end_time: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("posterior");
      expect(result.error.issues[0]?.path).toContain("end_time");
    }
  });

  it("rechaza un tramo con fin anterior al inicio", () => {
    const result = scheduleSlotSchema.safeParse({
      weekday: 1,
      start_time: "13:00",
      end_time: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("posterior");
    }
  });

  it("rechaza una hora con formato inválido", () => {
    const result = scheduleSlotSchema.safeParse({
      weekday: 1,
      start_time: "9:00",
      end_time: "25:00",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un weekday fuera de 0..6", () => {
    const result = scheduleSlotSchema.safeParse({
      weekday: 7,
      start_time: "09:00",
      end_time: "10:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("weeklyScheduleSchema — end_time > start_time y solapamientos", () => {
  it("acepta varios tramos no solapados del mismo día (mañana y tarde)", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: PRO_ID,
      slots: [
        { weekday: 1, start_time: "09:00", end_time: "13:00" },
        { weekday: 1, start_time: "16:00", end_time: "20:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza el horario completo si algún tramo incumple end_time > start_time", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: PRO_ID,
      slots: [
        { weekday: 1, start_time: "09:00", end_time: "13:00" },
        { weekday: 2, start_time: "18:00", end_time: "17:00" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza tramos que se solapan dentro del mismo día", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: PRO_ID,
      slots: [
        { weekday: 3, start_time: "09:00", end_time: "14:00" },
        { weekday: 3, start_time: "13:00", end_time: "18:00" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("solapar");
    }
  });

  it("permite mismos horarios en días distintos (no solapan entre sí)", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: PRO_ID,
      slots: [
        { weekday: 1, start_time: "09:00", end_time: "17:00" },
        { weekday: 2, start_time: "09:00", end_time: "17:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("acepta una semana sin tramos (horario vacío)", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: PRO_ID,
      slots: [],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un professional_id que no es UUID", () => {
    const result = weeklyScheduleSchema.safeParse({
      professional_id: "no-es-uuid",
      slots: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("exceptionSchema — horario especial condicional", () => {
  it("acepta un día libre (is_available=false) sin horas", () => {
    const result = exceptionSchema.safeParse({
      professional_id: PRO_ID,
      exception_date: "2025-06-09",
      is_available: false,
    });
    expect(result.success).toBe(true);
  });

  it("acepta un horario especial válido (fin posterior al inicio)", () => {
    const result = exceptionSchema.safeParse({
      professional_id: PRO_ID,
      exception_date: "2025-06-09",
      is_available: true,
      start_time: "10:00",
      end_time: "14:00",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un horario especial con fin ≤ inicio", () => {
    const result = exceptionSchema.safeParse({
      professional_id: PRO_ID,
      exception_date: "2025-06-09",
      is_available: true,
      start_time: "14:00",
      end_time: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("posterior");
    }
  });

  it("rechaza un horario especial sin horas de inicio/fin", () => {
    const result = exceptionSchema.safeParse({
      professional_id: PRO_ID,
      exception_date: "2025-06-09",
      is_available: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("horario especial");
    }
  });

  it("rechaza una fecha con formato inválido", () => {
    const result = exceptionSchema.safeParse({
      professional_id: PRO_ID,
      exception_date: "09/06/2025",
      is_available: false,
    });
    expect(result.success).toBe(false);
  });
});
