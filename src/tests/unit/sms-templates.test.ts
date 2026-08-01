/**
 * Textos SMS (`@/lib/sms/templates`) — interpolación y forma de texto plano.
 */
import { describe, expect, it } from "vitest";

import { buildAppointmentReminderSms, buildRevisionReminderSms } from "@/lib/sms/templates";

describe("buildAppointmentReminderSms", () => {
  it("interpola cliente, salón, fecha, hora y servicio en texto plano", () => {
    const text = buildAppointmentReminderSms({
      clientName: "Ana García",
      salonName: "Biodental",
      date: "martes, 14 de julio de 2026",
      time: "10:30",
      serviceName: "Revisión dental",
    });

    expect(text).toBe(
      "Hola Ana García, te recordamos tu cita en Biodental el martes, 14 de julio de 2026 " +
        "a las 10:30 (Revisión dental). Si no puedes acudir, avísanos.",
    );
    expect(text).not.toMatch(/[*_`#[\]]/); // sin markdown
    expect(text.length).toBeLessThanOrEqual(320);
  });
});

describe("buildRevisionReminderSms", () => {
  it("interpola cliente y salón en texto plano", () => {
    const text = buildRevisionReminderSms({
      clientName: "Ana García",
      salonName: "Biodental",
    });

    expect(text).toBe(
      "Hola Ana García, hace un tiempo de tu última visita a Biodental. " +
        "¿Reservamos tu revisión? Llámanos.",
    );
    expect(text).not.toMatch(/[*_`#[\]]/);
    expect(text.length).toBeLessThanOrEqual(320);
  });
});
