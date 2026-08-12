import { describe, it, expect } from "vitest";

import { agendaLocalMinutes, computeDayWindow } from "@/lib/agenda/day-model";

describe("agendaLocalMinutes", () => {
  it("convierte un instante ISO a minutos locales en la zona dada", () => {
    // 2026-08-12T07:30:00Z en Europe/Madrid (verano, UTC+2) = 09:30 local = 570 min
    expect(agendaLocalMinutes("2026-08-12T07:30:00Z", "Europe/Madrid")).toBe(9 * 60 + 30);
  });
});

describe("computeDayWindow", () => {
  const fallback = { startMin: 8 * 60, endMin: 21 * 60 };

  it("con apertura partida, la ventana abarca ambos tramos y marca el cierre de mediodía", () => {
    const ranges = [
      { startMin: 9 * 60, endMin: 14 * 60 },
      { startMin: 16 * 60, endMin: 20 * 60 },
    ];
    const w = computeDayWindow(ranges, [], fallback);
    expect(w.dayStartMin).toBe(9 * 60);
    expect(w.dayEndMin).toBe(20 * 60);
    expect(w.closed).toEqual([{ startMin: 14 * 60, endMin: 16 * 60 }]);
  });

  it("expande la ventana si hay citas fuera de la apertura", () => {
    const ranges = [{ startMin: 9 * 60, endMin: 14 * 60 }];
    const items = [{ startMin: 8 * 60 + 30, durationMin: 30 }];
    const w = computeDayWindow(ranges, items, fallback);
    expect(w.dayStartMin).toBe(8 * 60 + 30);
    expect(w.dayEndMin).toBe(14 * 60);
  });

  it("sin apertura definida, usa el fallback y no marca cierres", () => {
    const w = computeDayWindow([], [], fallback);
    expect(w.dayStartMin).toBe(8 * 60);
    expect(w.dayEndMin).toBe(21 * 60);
    expect(w.closed).toEqual([]);
  });
});
