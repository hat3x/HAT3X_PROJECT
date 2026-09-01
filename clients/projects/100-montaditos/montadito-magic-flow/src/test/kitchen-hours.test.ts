import { describe, it, expect } from "vitest";
import { isCocinaOpen, isBebidasOpen } from "@/lib/kitchen-hours";

// Semana de referencia en CEST (UTC+2): 2026-09-07 lunes … 2026-09-13 domingo.
// `madrid` recibe la hora de pared de Madrid y la convierte a UTC restando 2h.
const madrid = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00+02:00`);

const LUNES = "2026-09-07";
const VIERNES = "2026-09-11";
const SABADO = "2026-09-12";
const DOMINGO = "2026-09-13";

describe("horario de cocina", () => {
  it("lunes a jueves y domingos cierra a las 22:30", () => {
    expect(isCocinaOpen(madrid(LUNES, "22:29"))).toBe(true);
    expect(isCocinaOpen(madrid(LUNES, "22:30"))).toBe(false);
    expect(isCocinaOpen(madrid(DOMINGO, "22:29"))).toBe(true);
    expect(isCocinaOpen(madrid(DOMINGO, "22:30"))).toBe(false);
  });

  it("viernes y sábados cierra a las 23:30", () => {
    expect(isCocinaOpen(madrid(VIERNES, "23:29"))).toBe(true);
    expect(isCocinaOpen(madrid(VIERNES, "23:30"))).toBe(false);
    expect(isCocinaOpen(madrid(SABADO, "23:29"))).toBe(true);
    expect(isCocinaOpen(madrid(SABADO, "23:30"))).toBe(false);
  });
});

describe("horario de bebidas", () => {
  it("lunes a jueves y domingos cierra a las 23:00", () => {
    expect(isBebidasOpen(madrid(LUNES, "22:59"))).toBe(true);
    expect(isBebidasOpen(madrid(LUNES, "23:00"))).toBe(false);
    expect(isBebidasOpen(madrid(DOMINGO, "23:00"))).toBe(false);
  });

  it("viernes y sábados cierra a las 24:00", () => {
    expect(isBebidasOpen(madrid(VIERNES, "23:59"))).toBe(true);
    expect(isBebidasOpen(madrid(SABADO, "23:59"))).toBe(true);
    // 24:00 del sábado ya es domingo 00:00: madrugada, cerrado.
    expect(isBebidasOpen(madrid(DOMINGO, "00:00"))).toBe(false);
  });
});

describe("madrugada", () => {
  it("de 00:00 a 06:00 está todo cerrado, también el fin de semana", () => {
    for (const dia of [LUNES, SABADO, DOMINGO]) {
      expect(isCocinaOpen(madrid(dia, "00:15"))).toBe(false);
      expect(isBebidasOpen(madrid(dia, "00:15"))).toBe(false);
      expect(isBebidasOpen(madrid(dia, "05:59"))).toBe(false);
    }
  });
});

describe("las bebidas siempre cierran después que la cocina", () => {
  it("si no se pueden pedir bebidas, la cocina tampoco está abierta", () => {
    for (const dia of [LUNES, VIERNES, SABADO, DOMINGO]) {
      for (let m = 0; m < 24 * 60; m += 5) {
        const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const d = madrid(dia, hhmm);
        if (!isBebidasOpen(d)) expect(isCocinaOpen(d)).toBe(false);
      }
    }
  });
});
