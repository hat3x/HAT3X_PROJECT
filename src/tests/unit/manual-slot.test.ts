/**
 * Hueco a mano: la hora y la duración que decida quien atiende.
 *
 * Nadia (Biodental) lo pidió con estas palabras: poder dar la cita "a la hora
 * que quiera" y "como si hago una revisión de dos minutos". La rejilla de
 * huecos —cada 15 minutos, con la duración que dicta el servicio— es cómoda
 * para el caso normal, pero le impedía las dos cosas.
 *
 * Este módulo construye el hueco sin pasar por el motor. Lo que sí conserva son
 * las reglas que no son arbitrarias:
 *
 *  · Hay que elegir profesional concreto. "Cualquiera" solo tiene sentido
 *    cuando el motor busca por ti; si la hora la pones tú, alguien tiene que
 *    tenerla libre, y ese alguien hay que nombrarlo.
 *  · La duración es de al menos un minuto. Una cita de cero minutos no ocupa
 *    nada y ensucia la agenda sin decir nada a nadie.
 */
import { describe, expect, it } from "vitest";

import { buildManualSlot } from "@/lib/booking/manual-slot";

const TZ = "Europe/Madrid";
const PRO = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function ok(...args: Parameters<typeof buildManualSlot>) {
  const r = buildManualSlot(...args);
  if (!r.ok) throw new Error(`esperaba hueco válido, dio: ${r.error}`);
  return r.slot;
}

describe("buildManualSlot", () => {
  it("acepta una hora que la rejilla nunca ofrecería", () => {
    // 10:07 no es múltiplo de 15: es justo lo que la rejilla no deja elegir.
    const s = ok({ date: "2026-09-15", time: "10:07", durationMin: 30, timeZone: TZ, professionalId: PRO });

    expect(s.startsAt).toBe("2026-09-15T08:07:00.000Z");
    expect(s.endsAt).toBe("2026-09-15T08:37:00.000Z");
  });

  it("permite una revisión de dos minutos", () => {
    const s = ok({ date: "2026-09-15", time: "10:00", durationMin: 2, timeZone: TZ, professionalId: PRO });

    expect(s.endsAt).toBe("2026-09-15T08:02:00.000Z");
  });

  it("respeta el horario de invierno", () => {
    // En enero Madrid es UTC+1; en septiembre, UTC+2. Un desfase fijo daría
    // citas una hora corridas medio año.
    const s = ok({ date: "2026-01-15", time: "10:00", durationMin: 30, timeZone: TZ, professionalId: PRO });

    expect(s.startsAt).toBe("2026-01-15T09:00:00.000Z");
  });

  it("una cita que cruza la medianoche termina al día siguiente", () => {
    const s = ok({ date: "2026-09-15", time: "23:30", durationMin: 60, timeZone: TZ, professionalId: PRO });

    expect(s.endsAt).toBe("2026-09-15T22:30:00.000Z");
  });

  it("exige un profesional concreto", () => {
    // "Cualquiera" solo funciona cuando el motor busca. Si la hora la pones tu,
    // hay que decir quien la tiene libre.
    const r = buildManualSlot({ date: "2026-09-15", time: "10:07", durationMin: 30, timeZone: TZ, professionalId: "any" });

    expect(r.ok).toBe(false);
  });

  it("rechaza una duración de cero o negativa", () => {
    expect(buildManualSlot({ date: "2026-09-15", time: "10:00", durationMin: 0, timeZone: TZ, professionalId: PRO }).ok).toBe(false);
    expect(buildManualSlot({ date: "2026-09-15", time: "10:00", durationMin: -5, timeZone: TZ, professionalId: PRO }).ok).toBe(false);
  });

  it("rechaza una hora que no es una hora", () => {
    expect(buildManualSlot({ date: "2026-09-15", time: "25:00", durationMin: 30, timeZone: TZ, professionalId: PRO }).ok).toBe(false);
    expect(buildManualSlot({ date: "2026-09-15", time: "", durationMin: 30, timeZone: TZ, professionalId: PRO }).ok).toBe(false);
  });

  it("rechaza una duración absurda en vez de crear una cita de tres días", () => {
    // Un dedo de mas en el teclado no debe bloquear la agenda de una semana.
    expect(buildManualSlot({ date: "2026-09-15", time: "10:00", durationMin: 5000, timeZone: TZ, professionalId: PRO }).ok).toBe(false);
  });
});
