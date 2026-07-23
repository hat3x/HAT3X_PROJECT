/**
 * Tests unitarios del generador PURO de CITAS demo (`scripts/seed-demo-appointments`).
 *
 * El generador alimenta el paso `seedAppointments` de `scripts/seed-demo-salon.ts`
 * (sub-6). Su contrato con el ESQUEMA y con el motor de reservas es estricto y aquí
 * se blinda SIN base de datos:
 *   · NO SOLAPE POR PROFESIONAL — las citas de un mismo profesional no se pisan en el
 *     tiempo; si lo hicieran, la exclusión `appointment_blocks_no_overlap` (23P01)
 *     abortaría el INSERT. Es la invariante más importante del seed de citas.
 *   · MODELO DE 3 FASES — cada cita cabe en el horario de la sede de su profesional
 *     (start + duración total ≤ cierre) y su duración = suma de las 3 fases.
 *   · ESTACIONALIDAD — más viernes/sábado y picos en fechas señaladas (Navidad, etc.).
 *   · MEZCLA DE ESTADOS — mayoría pasadas `completed`; futuras `confirmed`/`pending`.
 *   · DETERMINISMO — requisito de la idempotencia additiva del seed (reejecutar no
 *     debe generar citas distintas).
 *
 * No toca la base de datos: los triggers (`trg_appointment_blocks_sync`,
 * `trg_appointments_create_visit`) se ejercitan en la siembra real, no aquí (este
 * módulo solo produce el PLAN de citas a insertar).
 */
import { describe, it, expect } from "vitest";

import {
  DEMO_LOCATIONS,
  DEMO_PROFESSIONALS,
  DEMO_SERVICES,
  professionalCoversService,
  serviceTotalMinutes,
} from "../../../scripts/seed-demo-data";
import {
  DEFAULT_APPOINTMENT_DENSITY,
  DEFAULT_FUTURE_DAYS,
  DEFAULT_PAST_MONTHS,
  MAX_APPOINTMENT_DENSITY,
  MIN_APPOINTMENT_DENSITY,
  generateDemoAppointments,
  resolveAppointmentDensity,
  seasonalMultiplier,
  type DemoAppointmentPlan,
} from "../../../scripts/seed-demo-appointments";

/** Fecha ancla del salón (un jueves de julio) para tests deterministas. */
const TODAY = "2026-07-23";
/** Nº de clientes de referencia (dentro del rango 80–150 del catálogo demo). */
const CUSTOMERS = 120;

/** Minutos desde medianoche de una hora `HH:MM`. */
function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Instante UTC de medianoche de una fecha `YYYY-MM-DD`. */
function utcMidnight(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Día de la semana (0=domingo … 6=sábado) de una fecha `YYYY-MM-DD`. */
function weekdayOf(dateStr: string): number {
  return new Date(utcMidnight(dateStr)).getUTCDay();
}

/** Fecha `YYYY-MM-DD` desplazada `days` días respecto a un ancla. */
function shiftDays(dateStr: string, days: number): string {
  const d = new Date(utcMidnight(dateStr) + days * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ventana de apertura (min-de-día) de la sede del profesional `name`. */
function windowFor(name: string): { open: number; close: number } {
  const pro = DEMO_PROFESSIONALS.find((p) => p.fullName === name);
  if (!pro) throw new Error(`Profesional desconocido: ${name}`);
  const loc = DEMO_LOCATIONS.find((l) => l.slug === pro.locationSlug);
  if (!loc) throw new Error(`Sede desconocida: ${pro.locationSlug}`);
  return { open: minutesOfDay(loc.openStart), close: minutesOfDay(loc.openEnd) };
}

const PLAN = generateDemoAppointments({ todayStr: TODAY, customerCount: CUSTOMERS });

describe("resolveAppointmentDensity — parseo + saturación al rango [0.2, 6]", () => {
  it("sin valor (undefined) ⇒ el por defecto", () => {
    expect(resolveAppointmentDensity(undefined)).toBe(DEFAULT_APPOINTMENT_DENSITY);
  });

  it.each([
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["no numérico", "abc"],
  ])("%s ⇒ el por defecto", (_label, input) => {
    expect(resolveAppointmentDensity(input)).toBe(DEFAULT_APPOINTMENT_DENSITY);
  });

  it("un valor dentro del rango se respeta", () => {
    expect(resolveAppointmentDensity("2")).toBe(2);
    expect(resolveAppointmentDensity(" 1.5 ")).toBe(1.5);
  });

  it("por debajo del mínimo ⇒ satura a 0.2; por encima del máximo ⇒ satura a 6", () => {
    expect(resolveAppointmentDensity("0")).toBe(MIN_APPOINTMENT_DENSITY);
    expect(resolveAppointmentDensity("-3")).toBe(MIN_APPOINTMENT_DENSITY);
    expect(resolveAppointmentDensity("99")).toBe(MAX_APPOINTMENT_DENSITY);
  });
});

describe("generateDemoAppointments — cardinalidad y determinismo", () => {
  it("produce un volumen no trivial de citas (~12 meses)", () => {
    expect(PLAN.length).toBeGreaterThan(300);
  });

  it("es DETERMINISTA: dos llamadas con los mismos parámetros son idénticas", () => {
    expect(generateDemoAppointments({ todayStr: TODAY, customerCount: CUSTOMERS })).toEqual(PLAN);
  });

  it("más densidad ⇒ más citas (la densidad escala el volumen)", () => {
    const sparse = generateDemoAppointments({ todayStr: TODAY, customerCount: CUSTOMERS, density: 0.4 });
    const dense = generateDemoAppointments({ todayStr: TODAY, customerCount: CUSTOMERS, density: 2.4 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });
});

describe("generateDemoAppointments — ventana temporal (~12 meses atrás + agenda futura)", () => {
  const firstDay = shiftDays(TODAY, -Math.round(DEFAULT_PAST_MONTHS * 31)); // cota inferior holgada
  const lastDay = shiftDays(TODAY, DEFAULT_FUTURE_DAYS); // cota superior (exclusiva en el motor)

  it("toda cita cae dentro de [~hoy−12m, hoy+28d]", () => {
    for (const a of PLAN) {
      expect(a.dateStr >= firstDay).toBe(true);
      expect(a.dateStr <= lastDay).toBe(true);
    }
  });

  it("hay historial (fechas pasadas) y agenda futura (fechas ≥ hoy)", () => {
    expect(PLAN.some((a) => a.dateStr < TODAY)).toBe(true);
    expect(PLAN.some((a) => a.dateStr >= TODAY)).toBe(true);
  });

  it("todas las citas caen en días de apertura L–S (nunca domingo)", () => {
    for (const a of PLAN) {
      const wd = weekdayOf(a.dateStr);
      expect(wd).toBeGreaterThanOrEqual(1);
      expect(wd).toBeLessThanOrEqual(6);
    }
  });
});

describe("generateDemoAppointments — modelo de 3 fases y horario de la sede", () => {
  it("cada cita cabe en el horario de la sede de su profesional (inicio + duración ≤ cierre)", () => {
    for (const a of PLAN) {
      const { open, close } = windowFor(a.professionalName);
      const start = minutesOfDay(a.startTime);
      expect(start).toBeGreaterThanOrEqual(open);
      expect(start + a.durationMinutes).toBeLessThanOrEqual(close);
    }
  });

  it("la duración de la cita = suma de las 3 fases del servicio; precio = snapshot del servicio", () => {
    const byName = new Map(DEMO_SERVICES.map((s) => [s.name, s]));
    for (const a of PLAN) {
      const service = byName.get(a.serviceName);
      expect(service).toBeDefined();
      if (service) {
        expect(a.durationMinutes).toBe(serviceTotalMinutes(service));
        expect(a.priceCents).toBe(service.priceCents);
      }
    }
  });

  it("el profesional SOLO presta servicios que cubre (espejo de professional_services)", () => {
    const proByName = new Map(DEMO_PROFESSIONALS.map((p) => [p.fullName, p]));
    const svcByName = new Map(DEMO_SERVICES.map((s) => [s.name, s]));
    for (const a of PLAN) {
      const pro = proByName.get(a.professionalName);
      const svc = svcByName.get(a.serviceName);
      expect(pro).toBeDefined();
      expect(svc).toBeDefined();
      if (pro && svc) expect(professionalCoversService(pro, svc)).toBe(true);
    }
  });
});

describe("generateDemoAppointments — NO SOLAPE por profesional (anti 23P01, el corazón del contrato)", () => {
  it("dos citas del mismo profesional nunca se pisan en el tiempo", () => {
    // Agrupa por (profesional, día) y verifica que, ordenadas por inicio, cada cita
    // termina antes (o justo cuando) empieza la siguiente. Como los rangos totales no
    // se solapan, tampoco lo harán los `appointment_blocks` (subconjuntos de fases).
    const byProDay = new Map<string, DemoAppointmentPlan[]>();
    for (const a of PLAN) {
      const key = `${a.professionalName}|${a.dateStr}`;
      const list = byProDay.get(key) ?? [];
      list.push(a);
      byProDay.set(key, list);
    }
    for (const list of byProDay.values()) {
      const sorted = [...list].sort((x, y) => minutesOfDay(x.startTime) - minutesOfDay(y.startTime));
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        const prevEnd = minutesOfDay(prev.startTime) + prev.durationMinutes;
        expect(minutesOfDay(curr.startTime)).toBeGreaterThanOrEqual(prevEnd);
      }
    }
  });
});

describe("generateDemoAppointments — estacionalidad (más viernes/sábado)", () => {
  it("el fin de semana concentra más citas que el principio de semana", () => {
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    for (const a of PLAN) byWeekday[weekdayOf(a.dateStr)]! += 1;
    // Sábado (6) > lunes (1) y viernes (5) > martes (2): el factor de día de semana manda.
    expect(byWeekday[6]!).toBeGreaterThan(byWeekday[1]!);
    expect(byWeekday[5]!).toBeGreaterThan(byWeekday[2]!);
  });
});

describe("seasonalMultiplier — picos en fechas señaladas de España/Madrid", () => {
  it("la campaña de Navidad dispara la demanda (22 dic)", () => {
    expect(seasonalMultiplier("2026-12-22")).toBeGreaterThanOrEqual(1.5);
  });

  it("el hueco de agosto la deprime (10 ago)", () => {
    expect(seasonalMultiplier("2026-08-10")).toBeLessThan(0.7);
  });

  it("un día corriente vale 1.0 (temporada normal)", () => {
    expect(seasonalMultiplier("2026-10-06")).toBe(1.0);
  });

  it("San Valentín eleva la demanda de febrero", () => {
    expect(seasonalMultiplier("2026-02-14")).toBeGreaterThan(1.0);
  });
});

describe("generateDemoAppointments — mezcla de estados (mayoría pasadas completed)", () => {
  const counts: Record<DemoAppointmentPlan["status"], number> = {
    completed: 0,
    cancelled: 0,
    no_show: 0,
    confirmed: 0,
    pending: 0,
  };
  for (const a of PLAN) counts[a.status] += 1;

  it("las citas PASADAS solo son completed/cancelled/no_show", () => {
    for (const a of PLAN) {
      if (a.dateStr < TODAY) {
        expect(["completed", "cancelled", "no_show"]).toContain(a.status);
      }
    }
  });

  it("las citas FUTURAS (≥ hoy) solo son confirmed/pending", () => {
    for (const a of PLAN) {
      if (a.dateStr >= TODAY) {
        expect(["confirmed", "pending"]).toContain(a.status);
      }
    }
  });

  it("la MAYORÍA de las citas son `completed` (historial dominante)", () => {
    expect(counts.completed).toBeGreaterThan(PLAN.length / 2);
  });

  it("hay una minoría realista de cancelled y no_show en el historial", () => {
    expect(counts.cancelled).toBeGreaterThan(0);
    expect(counts.no_show).toBeGreaterThan(0);
    expect(counts.cancelled).toBeLessThan(counts.completed);
    expect(counts.no_show).toBeLessThan(counts.completed);
  });

  it("la agenda futura tiene confirmadas y también algunas pendientes", () => {
    expect(counts.confirmed).toBeGreaterThan(0);
    expect(counts.pending).toBeGreaterThan(0);
  });
});

describe("generateDemoAppointments — vínculos con el catálogo (clientes/servicios)", () => {
  it("customerIndex siempre en el rango [0, customerCount)", () => {
    for (const a of PLAN) {
      expect(a.customerIndex).toBeGreaterThanOrEqual(0);
      expect(a.customerIndex).toBeLessThan(CUSTOMERS);
      expect(Number.isInteger(a.customerIndex)).toBe(true);
    }
  });

  it("hay clientes que repiten (habituales) y variedad de servicios/profesionales", () => {
    const distinctCustomers = new Set(PLAN.map((a) => a.customerIndex));
    const distinctServices = new Set(PLAN.map((a) => a.serviceName));
    const distinctPros = new Set(PLAN.map((a) => a.professionalName));
    // Menos clientes distintos que citas ⇒ hay recurrencia (habituales).
    expect(distinctCustomers.size).toBeLessThan(PLAN.length);
    expect(distinctServices.size).toBeGreaterThan(5);
    expect(distinctPros.size).toBe(DEMO_PROFESSIONALS.length);
  });
});
