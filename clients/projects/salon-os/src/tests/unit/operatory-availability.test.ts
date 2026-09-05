/**
 * El gabinete como recurso propio (B2).
 *
 * Hoy Biodental lo resuelve con `single_resource = true`, que bloquea el hueco
 * para TODA la clínica: si alguien está en un sillón, no se puede citar a nadie
 * más aunque haya otro libre. Sirve para una consulta de un gabinete y se rompe
 * en cuanto hay dos.
 *
 * El gabinete es un recurso compartido entre profesionales, y esa es la
 * diferencia con el horario: dos dentistas pueden trabajar a la vez, pero no en
 * el mismo sillón. De ahí lo que fijan estos tests:
 *
 *  · un gabinete ocupado no bloquea a los demás;
 *  · con un solo gabinete, dos citas a la vez son imposibles aunque haya dos
 *    profesionales libres;
 *  · sin gabinetes configurados NO se bloquea nada — una clínica que no los usa
 *    no puede quedarse sin poder citar por una función que no ha activado.
 */
import { describe, expect, it } from "vitest";

import { resolveOperatoryBusy } from "@/lib/booking/availability";

const MANANA = { start: 600, end: 660 }; // 10:00–11:00 en minutos locales

describe("resolveOperatoryBusy", () => {
  it("sin gabinetes configurados no bloquea nada", () => {
    // Una clinica que no usa gabinetes no puede quedarse sin poder citar por
    // una funcion que no ha activado.
    const r = resolveOperatoryBusy([], [{ operatoryId: "g1", ...MANANA }]);

    expect(r).toEqual([]);
  });

  it("con dos gabinetes, uno ocupado deja libre el otro", () => {
    const r = resolveOperatoryBusy(["g1", "g2"], [{ operatoryId: "g1", ...MANANA }]);

    expect(r).toEqual([]);
  });

  it("con un solo gabinete, ocuparlo bloquea esa franja", () => {
    // Es el caso de Biodental hoy, pero expresado donde corresponde: bloquea
    // porque no queda sillon, no porque la clinica entera se pare.
    const r = resolveOperatoryBusy(["g1"], [{ operatoryId: "g1", ...MANANA }]);

    expect(r).toEqual([MANANA]);
  });

  it("con dos gabinetes, los dos ocupados a la vez sí bloquean", () => {
    const r = resolveOperatoryBusy(
      ["g1", "g2"],
      [
        { operatoryId: "g1", ...MANANA },
        { operatoryId: "g2", ...MANANA },
      ],
    );

    expect(r).toEqual([MANANA]);
  });

  it("solo bloquea el tramo en que coinciden, no todo el día", () => {
    // g1 de 10 a 11, g2 de 10:30 a 12. Solo de 10:30 a 11 no queda sillon.
    const r = resolveOperatoryBusy(
      ["g1", "g2"],
      [
        { operatoryId: "g1", start: 600, end: 660 },
        { operatoryId: "g2", start: 630, end: 720 },
      ],
    );

    expect(r).toEqual([{ start: 630, end: 660 }]);
  });

  it("una cita sin gabinete asignado no ocupa ninguno", () => {
    // Durante la migracion habra citas antiguas sin gabinete. Tratarlas como
    // "ocupan todos" dejaria la agenda sin huecos de golpe.
    const r = resolveOperatoryBusy(["g1"], [{ operatoryId: null, ...MANANA }]);

    expect(r).toEqual([]);
  });

  it("una cita en un gabinete desconocido tampoco bloquea", () => {
    // Gabinete borrado o de otro salon: no se puede deducir nada de el.
    const r = resolveOperatoryBusy(["g1"], [{ operatoryId: "fantasma", ...MANANA }]);

    expect(r).toEqual([]);
  });
});
