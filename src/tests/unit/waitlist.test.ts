/**
 * Lista de espera — emparejar candidatos con un hueco que acaba de quedar libre
 * (B3 del roadmap de odontología).
 *
 * El problema real: cuando a las nueve de la mañana cancela alguien, hoy nadie
 * sabe a quién llamar y ese hueco se pierde. Un sillón vacío una hora es dinero
 * que no vuelve.
 *
 * Dos reglas que estos tests fijan porque afectan a personas:
 *
 *  1. **El hueco tiene que caber ENTERO en la disponibilidad del paciente.**
 *     Llamar a quien solo puede hasta las 14:00 para una cita de 13:45 a 14:30
 *     es hacerle perder el viaje.
 *  2. **A igual prioridad, manda la antigüedad en la lista.** Quien lleva más
 *     tiempo esperando va primero. Sin esa regla el orden lo decidiría el azar
 *     del array, y eso en una sala de espera se nota.
 */
import { describe, it, expect } from "vitest";

import { matchWaitlist, type FreedSlot, type WaitlistCandidate } from "@/lib/booking/waitlist";

const SERVICIO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTRO_SERVICIO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFESIONAL = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTRO_PROFESIONAL = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/** Lunes 2026-09-07, de 10:00 a 10:30 hora de Madrid (08:00 UTC en verano). */
const HUECO: FreedSlot = {
  startsAt: "2026-09-07T08:00:00.000Z",
  endsAt: "2026-09-07T08:30:00.000Z",
  timeZone: "Europe/Madrid",
  serviceId: SERVICIO,
  professionalId: PROFESIONAL,
};

const AHORA = new Date("2026-09-01T09:00:00.000Z");

function candidato(overrides: Partial<WaitlistCandidate> = {}): WaitlistCandidate {
  return {
    id: "w1",
    customerId: "cust-1",
    serviceId: SERVICIO,
    professionalId: null,
    weekdays: [],
    fromTime: null,
    toTime: null,
    priority: 0,
    createdAt: "2026-08-01T10:00:00.000Z",
    expiresAt: null,
    ...overrides,
  };
}

describe("matchWaitlist — quién entra", () => {
  it("un candidato sin restricciones encaja", () => {
    expect(matchWaitlist(HUECO, [candidato()], AHORA)).toHaveLength(1);
  });

  it("descarta a quien esperaba otro servicio", () => {
    const otro = candidato({ serviceId: OTRO_SERVICIO });
    expect(matchWaitlist(HUECO, [otro], AHORA)).toHaveLength(0);
  });

  it("incluye a quien le vale cualquier servicio", () => {
    const cualquiera = candidato({ serviceId: null });
    expect(matchWaitlist(HUECO, [cualquiera], AHORA)).toHaveLength(1);
  });

  it("descarta a quien pidió expresamente otro profesional", () => {
    const otro = candidato({ professionalId: OTRO_PROFESIONAL });
    expect(matchWaitlist(HUECO, [otro], AHORA)).toHaveLength(0);
  });

  it("incluye a quien pidió a ese profesional en concreto", () => {
    const suyo = candidato({ professionalId: PROFESIONAL });
    expect(matchWaitlist(HUECO, [suyo], AHORA)).toHaveLength(1);
  });

  it("descarta las entradas caducadas", () => {
    // Quien apuntó su disponibilidad para agosto no espera una llamada en
    // septiembre.
    const caducado = candidato({ expiresAt: "2026-08-31T22:00:00.000Z" });
    expect(matchWaitlist(HUECO, [caducado], AHORA)).toHaveLength(0);
  });
});

describe("matchWaitlist — disponibilidad del paciente", () => {
  it("descarta si el hueco cae en un día que no le viene bien", () => {
    // El hueco es lunes (1); este solo puede martes y jueves.
    const soloMartesYJueves = candidato({ weekdays: [2, 4] });
    expect(matchWaitlist(HUECO, [soloMartesYJueves], AHORA)).toHaveLength(0);
  });

  it("acepta si el lunes está entre sus días", () => {
    const lunesIncluido = candidato({ weekdays: [1, 3] });
    expect(matchWaitlist(HUECO, [lunesIncluido], AHORA)).toHaveLength(1);
  });

  it("descarta si empieza antes de su hora", () => {
    const soloTardes = candidato({ fromTime: "16:00", toTime: "20:00" });
    expect(matchWaitlist(HUECO, [soloTardes], AHORA)).toHaveLength(0);
  });

  it("descarta si la cita se sale de su franja por el final", () => {
    // Puede hasta las 10:15 y la cita termina a las 10:30: llamarle sería
    // hacerle venir para marcharse a media cita.
    const hastaLasDiezYCuarto = candidato({ fromTime: "09:00", toTime: "10:15" });
    expect(matchWaitlist(HUECO, [hastaLasDiezYCuarto], AHORA)).toHaveLength(0);
  });

  it("acepta cuando la cita entera cabe en su franja", () => {
    const manana = candidato({ fromTime: "09:00", toTime: "14:00" });
    expect(matchWaitlist(HUECO, [manana], AHORA)).toHaveLength(1);
  });
});

describe("matchWaitlist — a quién se llama primero", () => {
  it("la prioridad manda", () => {
    const normal = candidato({ id: "normal", priority: 0 });
    const urgente = candidato({ id: "urgente", priority: 10 });

    const orden = matchWaitlist(HUECO, [normal, urgente], AHORA).map((c) => c.id);
    expect(orden).toEqual(["urgente", "normal"]);
  });

  it("a igual prioridad, quien lleva más tiempo esperando", () => {
    const reciente = candidato({ id: "reciente", createdAt: "2026-08-20T10:00:00.000Z" });
    const antiguo = candidato({ id: "antiguo", createdAt: "2026-07-02T10:00:00.000Z" });

    const orden = matchWaitlist(HUECO, [reciente, antiguo], AHORA).map((c) => c.id);
    expect(orden).toEqual(["antiguo", "reciente"]);
  });

  it("no devuelve a nadie si la lista está vacía", () => {
    expect(matchWaitlist(HUECO, [], AHORA)).toEqual([]);
  });
});
