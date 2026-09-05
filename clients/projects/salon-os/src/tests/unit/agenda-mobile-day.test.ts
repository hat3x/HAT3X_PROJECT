/**
 * `buildMobileAgenda` — el día convertido en lista para el móvil.
 *
 * En el móvil la parrilla por profesional no cabe: con 360 px de ancho no
 * entran ni dos columnas, y una cita de 15 minutos mide 20 px de alto, así que
 * su tarjeta sale sin nombre ni servicio. Por eso en móvil el día se lee como
 * una lista por horas.
 *
 * Ese cambio de forma resuelve además el problema más feo de la parrilla: dos
 * citas a la misma hora dejan de pelearse por el ancho —en una lista son dos
 * filas— y no hace falta cálculo de carriles.
 *
 * Lo que fija este test:
 *  · orden cronológico, que es el único orden útil cuando se mira el día;
 *  · agrupación por la hora de INICIO, para poder buscar "lo de las 11";
 *  · las canceladas siguen saliendo: quien mira el día necesita saber que ese
 *    hueco se liberó, no que la cita nunca existió;
 *  · una cita que cruza de hora aparece UNA vez, en la suya.
 */
import { describe, expect, it } from "vitest";

import { buildMobileAgenda } from "@/lib/agenda/mobile-day";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

const TZ = "Europe/Madrid";

/** Cita del 29/08/2026 a la hora local indicada. Agosto en Madrid es UTC+2. */
function cita(
  id: string,
  horaLocal: string,
  minutos: number,
  extra: Partial<AppointmentWithDetails> = {},
): AppointmentWithDetails {
  const [h, m] = horaLocal.split(":").map(Number) as [number, number];
  const inicio = new Date(Date.UTC(2026, 7, 29, h - 2, m));
  const fin = new Date(inicio.getTime() + minutos * 60_000);
  return {
    id,
    starts_at: inicio.toISOString(),
    ends_at: fin.toISOString(),
    status: "confirmed",
    customer: { full_name: "Cliente " + id },
    professional: { full_name: "Raquel" },
    service: { name: "Corte" },
    ...extra,
  } as unknown as AppointmentWithDetails;
}

describe("buildMobileAgenda", () => {
  it("ordena por hora aunque lleguen desordenadas", () => {
    const grupos = buildMobileAgenda(
      [cita("tarde", "17:00", 30), cita("manana", "09:30", 30), cita("mediodia", "12:00", 30)],
      TZ,
    );

    const ids = grupos.flatMap((g) => g.entries.map((e) => e.appointment.id));
    expect(ids).toEqual(["manana", "mediodia", "tarde"]);
  });

  it("agrupa por la hora de inicio", () => {
    const grupos = buildMobileAgenda([cita("a", "11:00", 30), cita("b", "11:45", 30)], TZ);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.hourMin).toBe(11 * 60);
    expect(grupos[0]?.entries).toHaveLength(2);
  });

  it("separa en grupos distintos las horas distintas", () => {
    const grupos = buildMobileAgenda([cita("a", "10:30", 30), cita("b", "12:15", 30)], TZ);

    expect(grupos.map((g) => g.hourMin)).toEqual([10 * 60, 12 * 60]);
  });

  it("una cita que cruza de hora aparece una sola vez, en la suya", () => {
    // 90 minutos desde las 10:30 terminan a las 12:00, pero la cita es "de las
    // diez y media": duplicarla en tres franjas seria mentir sobre el dia.
    const grupos = buildMobileAgenda([cita("larga", "10:30", 90)], TZ);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.hourMin).toBe(10 * 60);
  });

  it("dos citas a la misma hora son dos filas, no un conflicto de ancho", () => {
    const grupos = buildMobileAgenda([cita("a", "11:00", 60), cita("b", "11:00", 60)], TZ);

    expect(grupos[0]?.entries.map((e) => e.appointment.id)).toEqual(["a", "b"]);
  });

  it("calcula la duración, que es lo que se enseña en la fila", () => {
    const grupos = buildMobileAgenda([cita("a", "10:30", 90)], TZ);

    expect(grupos[0]?.entries[0]?.durationMin).toBe(90);
  });

  it("conserva las canceladas: el hueco liberado es información del día", () => {
    const grupos = buildMobileAgenda(
      [cita("viva", "10:00", 30), cita("anulada", "11:00", 30, { status: "cancelled" })],
      TZ,
    );

    const ids = grupos.flatMap((g) => g.entries.map((e) => e.appointment.id));
    expect(ids).toContain("anulada");
  });

  it("un día sin citas no produce grupos vacíos", () => {
    expect(buildMobileAgenda([], TZ)).toEqual([]);
  });
});
