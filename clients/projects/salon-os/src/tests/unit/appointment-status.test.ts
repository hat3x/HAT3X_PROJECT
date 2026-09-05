import { describe, it, expect } from "vitest";

import {
  appointmentStatusDot,
  appointmentStatusAccent,
  APPOINTMENT_STATUS_LABELS,
} from "@/components/appointments/appointment-status";

describe("appointmentStatusDot", () => {
  it("devuelve una clase de color por estado, coherente con el acento", () => {
    expect(appointmentStatusDot("pending")).toBe("bg-warning");
    expect(appointmentStatusDot("confirmed")).toBe("bg-primary");
    expect(appointmentStatusDot("completed")).toBe("bg-success");
    expect(appointmentStatusDot("cancelled")).toBe("bg-destructive");
  });
  it("cubre los 5 estados", () => {
    (Object.keys(APPOINTMENT_STATUS_LABELS) as (keyof typeof APPOINTMENT_STATUS_LABELS)[]).forEach(
      (s) => expect(typeof appointmentStatusDot(s)).toBe("string"),
    );
    expect(appointmentStatusAccent("no_show")).toContain("muted");
  });
});
