/**
 * Excepciones del horario de la CLÍNICA: cerrar un día, o abrir un turno suelto.
 *
 * El caso que lo motiva, tal cual: Nicolás pasa consulta el martes 1 de
 * septiembre por la tarde, pero solo ese martes. Meter "martes por la tarde" en
 * el horario semanal abriría la clínica todos los martes del año, que no es lo
 * que ocurre.
 *
 * Hasta ahora las excepciones solo sabían CERRAR —vacaciones, un día libre—, y
 * el horario semanal de la clínica era la única forma de abrir. Por eso el
 * turno de tarde de Nicolás desaparecía: el motor cruza profesional ∩ clínica, y
 * la clínica seguía cerrando a las 14:00.
 *
 * Semántica que fijan estos tests, y que es la decisión de fondo:
 *
 *  · un **cierre** manda sobre todo lo demás. Si la clínica cierra ese día, da
 *    igual lo que digan el horario semanal o los turnos extra;
 *  · un **turno extra** SE SUMA al horario semanal, no lo sustituye. Es lo que
 *    significa "extra", y evita tener que reescribir la mañana para añadir una
 *    tarde.
 */
import { describe, expect, it } from "vitest";

import { resolveSalonRanges } from "@/lib/booking/availability";

// Martes 1 de septiembre de 2026.
const MARTES = "2026-09-01";
const SEMANAL = [{ weekday: 2, start_time: "10:00", end_time: "14:00" }];

describe("resolveSalonRanges", () => {
  it("sin excepciones, manda el horario semanal", () => {
    const r = resolveSalonRanges(MARTES, SEMANAL, []);

    expect(r).toEqual([{ start: 600, end: 840 }]);
  });

  it("un turno extra se SUMA a la mañana de siempre", () => {
    // El caso de Nicolás: la clínica abre además de 17 a 20, solo ese martes.
    const r = resolveSalonRanges(MARTES, SEMANAL, [
      { exception_date: MARTES, is_open: true, start_time: "17:00", end_time: "20:00" },
    ]);

    expect(r).toEqual([
      { start: 600, end: 840 },
      { start: 1020, end: 1200 },
    ]);
  });

  it("el turno extra no afecta a los demás martes", () => {
    const otroMartes = "2026-09-08";
    const r = resolveSalonRanges(otroMartes, SEMANAL, [
      { exception_date: MARTES, is_open: true, start_time: "17:00", end_time: "20:00" },
    ]);

    expect(r).toEqual([{ start: 600, end: 840 }]);
  });

  it("un cierre manda sobre el horario semanal", () => {
    const r = resolveSalonRanges(MARTES, SEMANAL, [
      { exception_date: MARTES, is_open: false, start_time: null, end_time: null },
    ]);

    expect(r).toEqual([]);
  });

  it("un cierre manda también sobre un turno extra del mismo día", () => {
    // Si alguien cierra el dia por un festivo, un turno extra apuntado antes no
    // puede resucitarlo: cerrado es cerrado.
    const r = resolveSalonRanges(MARTES, SEMANAL, [
      { exception_date: MARTES, is_open: true, start_time: "17:00", end_time: "20:00" },
      { exception_date: MARTES, is_open: false, start_time: null, end_time: null },
    ]);

    expect(r).toEqual([]);
  });

  it("se pueden añadir varios turnos extra el mismo día", () => {
    const r = resolveSalonRanges(MARTES, SEMANAL, [
      { exception_date: MARTES, is_open: true, start_time: "16:00", end_time: "17:00" },
      { exception_date: MARTES, is_open: true, start_time: "18:00", end_time: "20:00" },
    ]);

    expect(r).toHaveLength(3);
  });

  it("devuelve los tramos ordenados por hora", () => {
    // Sin orden, la rejilla de huecos saldria descolocada.
    const r = resolveSalonRanges(MARTES, SEMANAL, [
      { exception_date: MARTES, is_open: true, start_time: "08:00", end_time: "09:00" },
    ]);

    expect(r.map((x) => x.start)).toEqual([480, 600]);
  });

  it("abre un día que normalmente está cerrado", () => {
    // Domingo sin horario semanal, pero con una guardia puntual.
    const domingo = "2026-09-06";
    const r = resolveSalonRanges(domingo, SEMANAL, [
      { exception_date: domingo, is_open: true, start_time: "10:00", end_time: "13:00" },
    ]);

    expect(r).toEqual([{ start: 600, end: 780 }]);
  });
});
