import { describe, it, expect } from "vitest";

import { buildDayTimeline, snapMinutes } from "@/lib/agenda/timeline";

const OPTS = { dayStartMin: 9 * 60, dayEndMin: 20 * 60, base: 1, minCard: 60, extra: 40 };

describe("snapMinutes", () => {
  it("redondea al múltiplo más cercano", () => {
    expect(snapMinutes(612, 5)).toBe(610);
    expect(snapMinutes(613, 5)).toBe(615);
    expect(snapMinutes(600, 15)).toBe(600);
  });
});

describe("buildDayTimeline", () => {
  it("una cita larga NO se estira (altura natural >= minCard)", () => {
    const tl = buildDayTimeline([{ startMin: 9 * 60, durationMin: 90 }], OPTS);
    const h = tl.yAt(9 * 60 + 90) - tl.yAt(9 * 60);
    expect(h).toBeCloseTo(90, 5); // 90min * base 1 = 90px, > minCard 60
  });

  it("una cita corta se estira hasta minCard (nunca se corta)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20 }], OPTS);
    const h = tl.yAt(10 * 60 + 20) - tl.yAt(10 * 60);
    expect(h).toBeGreaterThanOrEqual(60 - 1e-6); // 20px natural -> estirado a >= 60
  });

  it("una cita con nota reserva altura extra (minCard + extra)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20, needsExtra: true }], OPTS);
    const h = tl.yAt(10 * 60 + 20) - tl.yAt(10 * 60);
    expect(h).toBeGreaterThanOrEqual(100 - 1e-6); // minCard 60 + extra 40
  });

  it("mantiene el orden temporal y el eje es monótono creciente", () => {
    const tl = buildDayTimeline(
      [{ startMin: 9 * 60, durationMin: 20 }, { startMin: 11 * 60, durationMin: 30 }],
      OPTS,
    );
    expect(tl.yAt(9 * 60)).toBeLessThan(tl.yAt(11 * 60));
    expect(tl.total).toBeGreaterThan(0);
  });

  it("minAt es la inversa de yAt (dentro de la tolerancia de snap)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20 }], OPTS);
    const min = 12 * 60 + 30;
    expect(tl.minAt(tl.yAt(min))).toBeCloseTo(min, 3);
  });

  it("clampa fuera de rango a los extremos del día", () => {
    const tl = buildDayTimeline([], OPTS);
    expect(tl.yAt(8 * 60)).toBe(0);
    expect(tl.yAt(21 * 60)).toBeCloseTo(tl.total, 5);
  });
});
