/**
 * Lógica PURA del rango de la analítica (`@/lib/metrics/range`). Todo se prueba con
 * un `now` FIJO y una `timeZone` explícita, de modo que las aserciones son
 * deterministas (sin depender de la fecha ni del huso de la máquina de CI):
 *
 *   · `localTodayIso` lee el día de calendario en la zona del salón (incl. DST).
 *   · Cada preset resuelve el `{ from, to }` correcto (con `to` inclusivo) y la
 *     granularidad acorde a la amplitud.
 *   · El rango `personalizado` valida `desde`/`hasta` y, si son inválidos, cae al
 *     preset por defecto — nunca lanza.
 *   · Helpers de calendario (`daySpan`, `granularityForSpan`, `isIsoDate`).
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE_PRESET,
  daySpan,
  granularityForSpan,
  isIsoDate,
  localTodayIso,
  parseRangePreset,
  resolveMetricsRange,
} from "@/lib/metrics/range";

/** Mediodía UTC del 23-jul-2026: lejos de los bordes de día en husos ±. */
const NOON = new Date("2026-07-23T12:00:00Z");

describe("localTodayIso", () => {
  it("lee el día local del salón, no el del servidor (madrugada CEST → día siguiente)", () => {
    // 22:30Z en verano en Madrid (UTC+2) ya es 00:30 del día siguiente.
    const madrugada = new Date("2026-07-23T22:30:00Z");
    expect(localTodayIso("Europe/Madrid", madrugada)).toBe("2026-07-24");
    // La misma instante en Honolulu (UTC-10) sigue siendo por la tarde del 23.
    expect(localTodayIso("Pacific/Honolulu", madrugada)).toBe("2026-07-23");
  });

  it("respeta el horario de invierno (Madrid UTC+1)", () => {
    const invierno = new Date("2026-01-15T23:30:00Z");
    expect(localTodayIso("Europe/Madrid", invierno)).toBe("2026-01-16");
  });

  it("no lanza con una zona inválida (cae a la del sistema)", () => {
    expect(() => localTodayIso("Zona/Inexistente", NOON)).not.toThrow();
  });
});

describe("resolveMetricsRange — presets", () => {
  const resolve = (sp: Record<string, string>) =>
    resolveMetricsRange(sp, "UTC", NOON); // en UTC, «hoy» = 2026-07-23

  it("hoy → un solo día, granularidad diaria", () => {
    const r = resolve({ rango: "hoy" });
    expect(r.period).toEqual({ from: "2026-07-23", to: "2026-07-23" });
    expect(r.granularity).toBe("day");
    expect(r.preset).toBe("hoy");
  });

  it("7d → últimos 7 días contando hoy (to inclusivo)", () => {
    const r = resolve({ rango: "7d" });
    expect(r.period).toEqual({ from: "2026-07-17", to: "2026-07-23" });
    expect(daySpan(r.period.from, r.period.to)).toBe(7);
    expect(r.granularity).toBe("day");
  });

  it("30d → últimos 30 días (cruza el borde de mes)", () => {
    const r = resolve({ rango: "30d" });
    expect(r.period).toEqual({ from: "2026-06-24", to: "2026-07-23" });
    expect(daySpan(r.period.from, r.period.to)).toBe(30);
  });

  it("mes → del día 1 del mes en curso hasta hoy", () => {
    const r = resolve({ rango: "mes" });
    expect(r.period).toEqual({ from: "2026-07-01", to: "2026-07-23" });
    expect(r.granularity).toBe("day");
  });

  it("ano → del 1-ene hasta hoy, granularidad mensual", () => {
    const r = resolve({ rango: "ano" });
    expect(r.period).toEqual({ from: "2026-01-01", to: "2026-07-23" });
    expect(r.granularity).toBe("month");
  });

  it("rango desconocido → preset por defecto", () => {
    const r = resolve({ rango: "trimestre" });
    expect(r.preset).toBe(DEFAULT_RANGE_PRESET);
    expect(r.period).toEqual({ from: "2026-06-24", to: "2026-07-23" });
  });

  it("sin parámetros → preset por defecto", () => {
    const r = resolveMetricsRange({}, "UTC", NOON);
    expect(r.preset).toBe(DEFAULT_RANGE_PRESET);
  });
});

describe("resolveMetricsRange — personalizado", () => {
  it("acepta desde/hasta válidos y elige granularidad por amplitud", () => {
    const r = resolveMetricsRange(
      { rango: "personalizado", desde: "2024-01-01", hasta: "2026-12-31" },
      "UTC",
      NOON,
    );
    expect(r.preset).toBe("personalizado");
    expect(r.period).toEqual({ from: "2024-01-01", to: "2026-12-31" });
    expect(r.granularity).toBe("year"); // 1096 días (>731) → año
  });

  it("un rango corto personalizado usa granularidad diaria", () => {
    const r = resolveMetricsRange(
      { rango: "personalizado", desde: "2026-07-01", hasta: "2026-07-15" },
      "UTC",
      NOON,
    );
    expect(r.granularity).toBe("day");
  });

  it("desde > hasta → cae al preset por defecto (no lanza)", () => {
    const r = resolveMetricsRange(
      { rango: "personalizado", desde: "2026-07-31", hasta: "2026-07-01" },
      "UTC",
      NOON,
    );
    expect(r.preset).toBe(DEFAULT_RANGE_PRESET);
  });

  it("fechas ausentes o inválidas → preset por defecto", () => {
    expect(
      resolveMetricsRange({ rango: "personalizado" }, "UTC", NOON).preset,
    ).toBe(DEFAULT_RANGE_PRESET);
    expect(
      resolveMetricsRange(
        { rango: "personalizado", desde: "2026-02-31", hasta: "2026-03-01" },
        "UTC",
        NOON,
      ).preset,
    ).toBe(DEFAULT_RANGE_PRESET);
  });
});

describe("helpers de calendario", () => {
  it("daySpan cuenta ambos extremos", () => {
    expect(daySpan("2026-07-01", "2026-07-01")).toBe(1);
    expect(daySpan("2026-07-01", "2026-07-07")).toBe(7);
  });

  it("granularityForSpan respeta los cortes ~2 meses / ~2 años", () => {
    expect(granularityForSpan(62)).toBe("day");
    expect(granularityForSpan(63)).toBe("month");
    expect(granularityForSpan(731)).toBe("month");
    expect(granularityForSpan(732)).toBe("year");
  });

  it("isIsoDate valida fechas de calendario reales", () => {
    expect(isIsoDate("2026-07-01")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("23/07/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("parseRangePreset filtra valores desconocidos", () => {
    expect(parseRangePreset("7d")).toBe("7d");
    expect(parseRangePreset("xyz")).toBe(DEFAULT_RANGE_PRESET);
    expect(parseRangePreset(undefined)).toBe(DEFAULT_RANGE_PRESET);
  });
});
