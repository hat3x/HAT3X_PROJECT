import { describe, it, expect } from "vitest";
import {
  generateSlots,
  generateDaySlots,
  mergeSlotsByProfessional,
  type ScheduleSlot,
  type BusyInterval,
  type GenerateSlotsInput,
  type DaySlot,
} from "@/lib/booking/availability";

// Fixed reference time: Monday 2025-06-09 08:00 UTC (10:00 Europe/Madrid CEST)
const NOW = new Date("2025-06-09T08:00:00.000Z");
const DATE = "2025-06-09"; // Lunes (weekday 1)
const TZ = "Europe/Madrid";

const MONDAY_SCHEDULE: ScheduleSlot[] = [
  { weekday: 1, start_time: "09:00:00", end_time: "17:00:00" },
];

describe("generateSlots", () => {
  it("returns empty array when serviceDurationMinutes <= 0", () => {
    expect(
      generateSlots({
        date: DATE,
        timeZone: TZ,
        serviceDurationMinutes: 0,
        schedules: MONDAY_SCHEDULE,
        busy: [],
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("returns slots within working hours", () => {
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 60,
      schedules: MONDAY_SCHEDULE,
      busy: [],
      slotIntervalMinutes: 60,
      minLeadMinutes: 0,
      now: new Date("2025-06-09T00:00:00.000Z"), // midnight — all slots in future
    });

    // 09:00–17:00 with 60min service & 60min interval → 8 slots (09:00, 10:00 … 16:00)
    expect(slots.length).toBe(8);
    // All slots are ISO strings
    slots.forEach((s) => {
      expect(s.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(s.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
    // Each slot's endsAt is exactly 60 minutes after startsAt
    slots.forEach((s) => {
      const diff =
        new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
      expect(diff).toBe(60 * 60 * 1000);
    });
  });

  it("excludes slots that start before earliest (minLeadMinutes)", () => {
    // now = 10:00 Madrid time, minLead = 30min → earliest = 10:30 Madrid
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      busy: [],
      slotIntervalMinutes: 30,
      minLeadMinutes: 30,
      now: NOW, // 08:00 UTC = 10:00 CEST
    });

    // 09:00–17:00 with 30min service, 30min interval, earliest = 10:30 Madrid
    // Excluded: 09:00, 09:30, 10:00 → first allowed = 10:30
    const firstStart = slots[0]?.startsAt;
    expect(firstStart).toBeDefined();
    const firstHour = new Date(firstStart!).getUTCHours();
    // 10:30 CEST = 08:30 UTC
    expect(firstHour).toBe(8);
    expect(new Date(firstStart!).getUTCMinutes()).toBe(30);
  });

  it("returns empty when day has no schedule", () => {
    // MONDAY_SCHEDULE only has weekday 1; DATE = Mon so passing a Tue schedule gives nothing
    const tuesdaySchedule: ScheduleSlot[] = [
      { weekday: 2, start_time: "09:00:00", end_time: "17:00:00" },
    ];
    const slots = generateSlots({
      date: DATE, // Monday
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: tuesdaySchedule,
      busy: [],
      now: new Date("2025-06-09T00:00:00.000Z"),
    });
    expect(slots).toEqual([]);
  });

  it("respects exception: closed day", () => {
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      exception: { is_available: false, start_time: null, end_time: null },
      busy: [],
      now: new Date("2025-06-09T00:00:00.000Z"),
    });
    expect(slots).toEqual([]);
  });

  it("respects exception: custom hours override schedule", () => {
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE, // 09:00–17:00
      exception: {
        is_available: true,
        start_time: "10:00:00",
        end_time: "12:00:00",
      },
      busy: [],
      slotIntervalMinutes: 30,
      now: new Date("2025-06-09T00:00:00.000Z"),
    });

    // 10:00–12:00 with 30min service & 30min interval → 4 slots
    expect(slots.length).toBe(4);
    // First slot: 10:00 Madrid = 08:00 UTC
    expect(new Date(slots[0]!.startsAt).getUTCHours()).toBe(8);
    expect(new Date(slots[0]!.startsAt).getUTCMinutes()).toBe(0);
  });

  it("excludes slots overlapping busy intervals", () => {
    // Busy 10:00–11:00 Madrid (08:00–09:00 UTC)
    const busy: BusyInterval[] = [
      {
        starts_at: "2025-06-09T08:00:00.000Z",
        ends_at: "2025-06-09T09:00:00.000Z",
      },
    ];

    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 60,
      schedules: MONDAY_SCHEDULE,
      busy,
      slotIntervalMinutes: 60,
      now: new Date("2025-06-09T00:00:00.000Z"),
    });

    // 10:00 Madrid = 08:00 UTC → blocked
    const startsAtUtcHours = slots.map((s) => new Date(s.startsAt).getUTCHours());
    expect(startsAtUtcHours).not.toContain(8);
  });

  it("does not generate slot that would end after working hours", () => {
    // 30min service, 15min interval → last valid start is 16:30 (end 17:00)
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE, // ends 17:00
      busy: [],
      slotIntervalMinutes: 15,
      now: new Date("2025-06-09T00:00:00.000Z"),
    });

    const lastSlot = slots[slots.length - 1];
    expect(lastSlot).toBeDefined();
    // 16:30 Madrid = 14:30 UTC
    expect(new Date(lastSlot!.startsAt).getUTCHours()).toBe(14);
    expect(new Date(lastSlot!.startsAt).getUTCMinutes()).toBe(30);
  });

  it("handles multiple schedule ranges in a day", () => {
    const splitSchedule: ScheduleSlot[] = [
      { weekday: 1, start_time: "09:00:00", end_time: "13:00:00" },
      { weekday: 1, start_time: "15:00:00", end_time: "17:00:00" },
    ];

    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 60,
      schedules: splitSchedule,
      busy: [],
      slotIntervalMinutes: 60,
      now: new Date("2025-06-09T00:00:00.000Z"),
    });

    // Morning: 09:00, 10:00, 11:00, 12:00 → 4 slots
    // Afternoon: 15:00, 16:00 → 2 slots
    expect(slots.length).toBe(6);
  });
});

describe("generateSlots — modelo de fases (appointment_blocks)", () => {
  // Servicio de 3 fases: aplicación 30 / exposición 60 / post 15.
  // Bloqueo efectivo del profesional = 30 + 15 = 45 min (la exposición NO bloquea).
  // Duración total de la cita = 105 min.
  const APPLICATION = 30;
  const EXPOSURE = 60;
  const POST = 15;
  const BLOCKING = APPLICATION + POST; // 45
  const TOTAL = APPLICATION + EXPOSURE + POST; // 105
  const MIDNIGHT = new Date("2025-06-09T00:00:00.000Z");

  it("permite reservar en el hueco de exposición de otra cita del profesional", () => {
    // Otra cita ocupa SOLO sus bloques físicos (lo que hay en appointment_blocks):
    //   · application:   10:00–10:30 Madrid = 08:00–08:30 UTC
    //   · post_exposure: 11:30–11:45 Madrid = 09:30–09:45 UTC
    // Su exposición 10:30–11:30 queda LIBRE y no aparece como bloque ocupado.
    const busy: BusyInterval[] = [
      { starts_at: "2025-06-09T08:00:00.000Z", ends_at: "2025-06-09T08:30:00.000Z" },
      { starts_at: "2025-06-09T09:30:00.000Z", ends_at: "2025-06-09T09:45:00.000Z" },
    ];

    // Nueva cita corta (solo aplicación, 30 min) que cabe en el hueco de exposición.
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30, // bloqueo = aplicación
      appointmentDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      busy,
      slotIntervalMinutes: 30,
      now: MIDNIGHT,
    });

    // 10:30 Madrid = 08:30 UTC cae en la exposición ajena y debe estar disponible.
    const has1030 = slots.some(
      (s) =>
        new Date(s.startsAt).getUTCHours() === 8 &&
        new Date(s.startsAt).getUTCMinutes() === 30,
    );
    expect(has1030).toBe(true);
  });

  it("usa la duración total para endsAt y el encaje en horario", () => {
    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: BLOCKING, // 45 → ventana de solape
      appointmentDurationMinutes: TOTAL, // 105 → endsAt y lastStart
      schedules: MONDAY_SCHEDULE, // 09:00–17:00
      busy: [],
      slotIntervalMinutes: 15,
      now: MIDNIGHT,
    });

    // endsAt refleja la duración total (105 min), no la de bloqueo.
    slots.forEach((s) => {
      const diff = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
      expect(diff).toBe(TOTAL * 60 * 1000);
    });

    // El último inicio deja sitio a la cita completa: 17:00 − 105 min = 15:15 Madrid = 13:15 UTC.
    const last = slots[slots.length - 1];
    expect(last).toBeDefined();
    expect(new Date(last!.startsAt).getUTCHours()).toBe(13);
    expect(new Date(last!.startsAt).getUTCMinutes()).toBe(15);
  });

  it("la ventana de solape usa la duración de bloqueo, no la total", () => {
    // Bloque ocupado a las 09:50–10:00 Madrid = 07:50–08:00 UTC.
    const busy: BusyInterval[] = [
      { starts_at: "2025-06-09T07:50:00.000Z", ends_at: "2025-06-09T08:00:00.000Z" },
    ];

    const slots = generateSlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: BLOCKING, // 45
      appointmentDurationMinutes: TOTAL, // 105
      schedules: MONDAY_SCHEDULE,
      busy,
      slotIntervalMinutes: 15,
      now: MIDNIGHT,
    });

    // 09:15 Madrid = 07:15 UTC: ventana de bloqueo [09:15, 10:00) toca el bloque → descartado.
    const has0915 = slots.some(
      (s) => new Date(s.startsAt).getUTCHours() === 7 && new Date(s.startsAt).getUTCMinutes() === 15,
    );
    expect(has0915).toBe(false);

    // 09:00 Madrid = 07:00 UTC: ventana [09:00, 09:45) no llega al bloque → disponible.
    const has0900 = slots.some(
      (s) => new Date(s.startsAt).getUTCHours() === 7 && new Date(s.startsAt).getUTCMinutes() === 0,
    );
    expect(has0900).toBe(true);
  });
});

describe("generateDaySlots", () => {
  const MIDNIGHT = new Date("2025-06-09T00:00:00.000Z");

  /** Solo los slots disponibles, proyectados a la forma de generateSlots. */
  function availableAsSlots(day: DaySlot[]): { startsAt: string; endsAt: string }[] {
    return day
      .filter((s) => s.available)
      .map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
  }

  // ── INVARIANTE CENTRAL ────────────────────────────────────────────────────
  // Los available:true de generateDaySlots deben coincidir EXACTAMENTE (mismo
  // orden y mismos instantes) con lo que devuelve generateSlots para el mismo input.
  describe("invariante: available:true === generateSlots", () => {
    const scenarios: Array<{ name: string; input: GenerateSlotsInput }> = [
      {
        name: "día simple sin ocupación",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 30,
          schedules: MONDAY_SCHEDULE,
          busy: [],
          slotIntervalMinutes: 15,
          now: MIDNIGHT,
        },
      },
      {
        name: "con bloques ocupados (application/post ajenos)",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 30,
          appointmentDurationMinutes: 30,
          schedules: MONDAY_SCHEDULE,
          busy: [
            { starts_at: "2025-06-09T08:00:00.000Z", ends_at: "2025-06-09T08:30:00.000Z" },
            { starts_at: "2025-06-09T09:30:00.000Z", ends_at: "2025-06-09T09:45:00.000Z" },
          ],
          slotIntervalMinutes: 30,
          now: MIDNIGHT,
        },
      },
      {
        name: "con antelación mínima (parte del día en pasado)",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 30,
          schedules: MONDAY_SCHEDULE,
          busy: [],
          slotIntervalMinutes: 30,
          minLeadMinutes: 30,
          now: NOW, // 10:00 Madrid → 09:00/09:30/10:00 quedan atrás
        },
      },
      {
        name: "servicio de 3 fases (bloqueo 45 / total 105)",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 45,
          appointmentDurationMinutes: 105,
          schedules: MONDAY_SCHEDULE,
          busy: [
            { starts_at: "2025-06-09T07:50:00.000Z", ends_at: "2025-06-09T08:00:00.000Z" },
          ],
          slotIntervalMinutes: 15,
          now: MIDNIGHT,
        },
      },
      {
        name: "horario partido (mañana + tarde)",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 60,
          schedules: [
            { weekday: 1, start_time: "09:00:00", end_time: "13:00:00" },
            { weekday: 1, start_time: "15:00:00", end_time: "17:00:00" },
          ],
          busy: [],
          slotIntervalMinutes: 60,
          now: MIDNIGHT,
        },
      },
      {
        name: "excepción con horario propio",
        input: {
          date: DATE,
          timeZone: TZ,
          serviceDurationMinutes: 30,
          schedules: MONDAY_SCHEDULE,
          exception: { is_available: true, start_time: "10:00:00", end_time: "12:00:00" },
          busy: [],
          slotIntervalMinutes: 30,
          now: MIDNIGHT,
        },
      },
    ];

    for (const { name, input } of scenarios) {
      it(`coincide en: ${name}`, () => {
        const day = generateDaySlots(input);
        const free = generateSlots(input);
        expect(availableAsSlots(day)).toEqual(free);
      });
    }
  });

  it("devuelve TODOS los pasos de la jornada, no solo los libres", () => {
    // 09:00–17:00 con paso 15 → 32 posiciones cuyo inicio cae dentro del tramo
    // (09:00 … 16:45). generateSlots solo devolvería las que además caben (≤16:30).
    const input: GenerateSlotsInput = {
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      busy: [],
      slotIntervalMinutes: 15,
      now: MIDNIGHT,
    };
    const day = generateDaySlots(input);
    expect(day.length).toBe(32); // (17:00−09:00)=480 min / 15 = 32 posiciones
    expect(day.length).toBeGreaterThan(generateSlots(input).length);
    // Todos los slots llevan endsAt = inicio + duración total (30 min).
    day.forEach((s) => {
      const diff = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
      expect(diff).toBe(30 * 60 * 1000);
    });
  });

  it("etiqueta 'closed' los pasos que no caben antes del cierre", () => {
    // 30min servicio, paso 15, cierre 17:00: 16:45 empieza dentro pero termina
    // 17:15 > 17:00 → no cabe → available:false, reason:'closed'.
    const day = generateDaySlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      busy: [],
      slotIntervalMinutes: 15,
      now: MIDNIGHT,
    });
    const last = day[day.length - 1]!;
    expect(new Date(last.startsAt).getUTCHours()).toBe(14); // 16:45 Madrid = 14:45 UTC
    expect(new Date(last.startsAt).getUTCMinutes()).toBe(45);
    expect(last.available).toBe(false);
    expect(last.reason).toBe("closed");
    // El último reservable (16:30) sigue siendo available.
    const fitting = day.find(
      (s) => new Date(s.startsAt).getUTCHours() === 14 && new Date(s.startsAt).getUTCMinutes() === 30,
    )!;
    expect(fitting.available).toBe(true);
    expect(fitting.reason).toBeUndefined();
  });

  it("etiqueta 'past' los pasos anteriores a la antelación mínima", () => {
    // now = 10:00 Madrid, minLead 30 → earliest 10:30. 09:00/09:30/10:00 → past.
    const day = generateDaySlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 30,
      schedules: MONDAY_SCHEDULE,
      busy: [],
      slotIntervalMinutes: 30,
      minLeadMinutes: 30,
      now: NOW, // 08:00 UTC = 10:00 CEST
    });
    const past = day.filter((s) => s.reason === "past");
    // 09:00, 09:30, 10:00 Madrid = 07:00, 07:30, 08:00 UTC
    expect(past.map((s) => new Date(s.startsAt).getUTCHours())).toEqual([7, 7, 8]);
    past.forEach((s) => expect(s.available).toBe(false));
    // 10:30 (08:30 UTC) es el primero disponible.
    const first = day.find((s) => s.available)!;
    expect(new Date(first.startsAt).getUTCHours()).toBe(8);
    expect(new Date(first.startsAt).getUTCMinutes()).toBe(30);
  });

  it("etiqueta 'occupied' los pasos que solapan un bloque físico del profesional", () => {
    // Bloque ocupado 10:00–11:00 Madrid (08:00–09:00 UTC), servicio 60/paso 60.
    const day = generateDaySlots({
      date: DATE,
      timeZone: TZ,
      serviceDurationMinutes: 60,
      schedules: MONDAY_SCHEDULE,
      busy: [{ starts_at: "2025-06-09T08:00:00.000Z", ends_at: "2025-06-09T09:00:00.000Z" }],
      slotIntervalMinutes: 60,
      now: MIDNIGHT,
    });
    const at1000 = day.find((s) => new Date(s.startsAt).getUTCHours() === 8)!;
    expect(at1000.available).toBe(false);
    expect(at1000.reason).toBe("occupied");
  });

  describe("modelo de 3 fases", () => {
    // Otra cita del profesional: application 10:00–10:30 y post 11:30–11:45 Madrid.
    // Su exposición 10:30–11:30 NO genera bloque (no está en appointment_blocks).
    const busy: BusyInterval[] = [
      { starts_at: "2025-06-09T08:00:00.000Z", ends_at: "2025-06-09T08:30:00.000Z" },
      { starts_at: "2025-06-09T09:30:00.000Z", ends_at: "2025-06-09T09:45:00.000Z" },
    ];

    const dayFor = () =>
      generateDaySlots({
        date: DATE,
        timeZone: TZ,
        serviceDurationMinutes: 30, // nueva cita corta (solo aplicación)
        appointmentDurationMinutes: 30,
        schedules: MONDAY_SCHEDULE,
        busy,
        slotIntervalMinutes: 30,
        now: MIDNIGHT,
      });

    it("el hueco de EXPOSICIÓN ajena sale available:true", () => {
      // 10:30 Madrid = 08:30 UTC cae en la exposición ajena.
      const at1030 = dayFor().find(
        (s) => new Date(s.startsAt).getUTCHours() === 8 && new Date(s.startsAt).getUTCMinutes() === 30,
      )!;
      expect(at1030.available).toBe(true);
      expect(at1030.reason).toBeUndefined();
    });

    it("los tramos de APLICACIÓN y POST-EXPOSICIÓN salen occupied", () => {
      const day = dayFor();
      const at1000 = day.find(
        (s) => new Date(s.startsAt).getUTCHours() === 8 && new Date(s.startsAt).getUTCMinutes() === 0,
      )!;
      const at1130 = day.find(
        (s) => new Date(s.startsAt).getUTCHours() === 9 && new Date(s.startsAt).getUTCMinutes() === 30,
      )!;
      expect(at1000.reason).toBe("occupied"); // application ajena
      expect(at1130.reason).toBe("occupied"); // post-exposición ajena
    });
  });

  it("devuelve [] cuando serviceDurationMinutes <= 0", () => {
    expect(
      generateDaySlots({
        date: DATE,
        timeZone: TZ,
        serviceDurationMinutes: 0,
        schedules: MONDAY_SCHEDULE,
        busy: [],
        now: MIDNIGHT,
      }),
    ).toEqual([]);
  });

  it("devuelve [] en día no laborable (sin horario o excepción cerrada)", () => {
    expect(
      generateDaySlots({
        date: DATE, // lunes
        timeZone: TZ,
        serviceDurationMinutes: 30,
        schedules: [{ weekday: 2, start_time: "09:00:00", end_time: "17:00:00" }],
        busy: [],
        now: MIDNIGHT,
      }),
    ).toEqual([]);

    expect(
      generateDaySlots({
        date: DATE,
        timeZone: TZ,
        serviceDurationMinutes: 30,
        schedules: MONDAY_SCHEDULE,
        exception: { is_available: false, start_time: null, end_time: null },
        busy: [],
        now: MIDNIGHT,
      }),
    ).toEqual([]);
  });
});

describe("mergeSlotsByProfessional", () => {
  const slotA = {
    startsAt: "2025-06-09T09:00:00.000Z",
    endsAt: "2025-06-09T10:00:00.000Z",
  };
  const slotB = {
    startsAt: "2025-06-09T10:00:00.000Z",
    endsAt: "2025-06-09T11:00:00.000Z",
  };

  it("returns empty when no professionals", () => {
    expect(mergeSlotsByProfessional([])).toEqual([]);
  });

  it("merges slots from single professional", () => {
    const result = mergeSlotsByProfessional([
      { professionalId: "prof-1", slots: [slotA, slotB] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ...slotA, professionalId: "prof-1" });
  });

  it("deduplicates overlapping start times, keeping first professional", () => {
    const result = mergeSlotsByProfessional([
      { professionalId: "prof-1", slots: [slotA] },
      { professionalId: "prof-2", slots: [slotA, slotB] },
    ]);
    // slotA appears from both professionals, only first is kept
    expect(result).toHaveLength(2);
    const foundA = result.find((s) => s.startsAt === slotA.startsAt);
    expect(foundA?.professionalId).toBe("prof-1");
  });

  it("is sorted by startsAt ascending", () => {
    const result = mergeSlotsByProfessional([
      { professionalId: "prof-2", slots: [slotB] },
      { professionalId: "prof-1", slots: [slotA] },
    ]);
    expect(result[0]?.startsAt).toBe(slotA.startsAt);
    expect(result[1]?.startsAt).toBe(slotB.startsAt);
  });
});
