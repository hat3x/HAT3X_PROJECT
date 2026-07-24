/**
 * Rejilla compartida `DaySlots` (sub-6) — ACCESIBILIDAD y CONTRATO de reserva.
 *
 * `DaySlots` es el ÚNICO componente que pintan a la vez la reserva pública (asistente)
 * y la creación de cita del panel, así que es el punto donde se ENFORCE el contrato:
 * se muestra la jornada COMPLETA (libres + ocupados/pasados/cerrados) pero solo los
 * huecos libres son reservables. Aquí se prueba justo eso, a nivel de componente y sin
 * mocks (rápido y robusto):
 *
 *   A) La UI DESHABILITA los huecos `available: false`: van con `aria-disabled`, fuera
 *      del recorrido de teclado (`tabIndex=-1`), SIN click, y EXPONEN el motivo por
 *      `aria-label` («10:00 — ocupado») y su pista por `title`. Un `click` sobre ellos
 *      NO dispara `onSelect`.
 *   B) CONTRATO/aislamiento: con la rejilla completa a la vista, los reservables son
 *      EXACTAMENTE los `available: true`. El hueco de EXPOSICIÓN de una cita de 3 fases
 *      aparece como reservable (por diseño: un servicio corto cabe ahí); ni la
 *      aplicación/post ocupadas, ni los pasados, ni los cerrados lo son.
 */
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DaySlots } from "@/components/booking/day-slots";
import type { PublicDaySlot, PublicSlot } from "@/lib/booking/types";

// Europe/Madrid en verano → UTC+2: los ISO en UTC se leen +2h como hora de pantalla.
const TZ = "Europe/Madrid";
const PROF = "33333333-3333-3333-3333-333333333333";

/** Construye un paso de la rejilla del profesional {@link PROF}. */
function daySlot(
  startUtc: string,
  endUtc: string,
  rest: { available: boolean; reason?: PublicDaySlot["reason"] },
): PublicDaySlot {
  return { startsAt: startUtc, endsAt: endUtc, professionalId: PROF, ...rest };
}

// Jornada realista con UNA cita de 3 fases del profesional ya reservada:
//   · aplicación   10:00 (08:00Z) → genera bloque → occupied
//   · exposición   10:30 y 11:00 (08:30Z/09:00Z) → NO genera bloque → LIBRE (hueco)
//   · post         11:30 (09:30Z) → genera bloque → occupied
// más un paso pasado (09:00) y uno que no cabe al cierre (16:45, closed).
const PAST = daySlot("2026-07-20T07:00:00.000Z", "2026-07-20T07:30:00.000Z", {
  available: false,
  reason: "past",
}); // 09:00
const APPLICATION = daySlot("2026-07-20T08:00:00.000Z", "2026-07-20T08:30:00.000Z", {
  available: false,
  reason: "occupied",
}); // 10:00
const EXPOSURE_1 = daySlot("2026-07-20T08:30:00.000Z", "2026-07-20T09:00:00.000Z", {
  available: true,
}); // 10:30 — hueco de exposición
const EXPOSURE_2 = daySlot("2026-07-20T09:00:00.000Z", "2026-07-20T09:30:00.000Z", {
  available: true,
}); // 11:00 — hueco de exposición
const POST = daySlot("2026-07-20T09:30:00.000Z", "2026-07-20T10:00:00.000Z", {
  available: false,
  reason: "occupied",
}); // 11:30
const CLOSED = daySlot("2026-07-20T14:45:00.000Z", "2026-07-20T15:15:00.000Z", {
  available: false,
  reason: "closed",
}); // 16:45

const FULL_DAY = [PAST, APPLICATION, EXPOSURE_1, EXPOSURE_2, POST, CLOSED];

/** Monta la rejilla y devuelve el espía de selección. */
function renderGrid(
  slots: PublicDaySlot[],
  opts?: { anyProfessional?: boolean; selected?: PublicSlot | null },
): { onSelect: ReturnType<typeof vi.fn> } {
  const onSelect = vi.fn();
  render(
    createElement(DaySlots, {
      slots,
      timeZone: TZ,
      selected: opts?.selected ?? null,
      anyProfessional: opts?.anyProfessional ?? false,
      onSelect,
    }),
  );
  return { onSelect };
}

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────────
// A) La UI deshabilita los huecos no disponibles y expone el motivo (a11y).
// ─────────────────────────────────────────────────────────────────────────────
describe("DaySlots · deshabilita los huecos no disponibles y expone el motivo", () => {
  it("un hueco LIBRE es un botón reservable cuyo nombre accesible es la hora", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid([APPLICATION, EXPOSURE_1]);

    const free = screen.getByRole("button", { name: "10:30" });
    // Reservable: sin aria-disabled, marcado con aria-pressed, título de disponible.
    expect(free).not.toHaveAttribute("aria-disabled");
    expect(free).toHaveAttribute("aria-pressed", "false");
    expect(free).toHaveAttribute("title", "Disponible · 10:30");

    await user.click(free);

    // Dispara onSelect con EXACTAMENTE el PublicSlot (sin available/reason).
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
      startsAt: EXPOSURE_1.startsAt,
      endsAt: EXPOSURE_1.endsAt,
      professionalId: PROF,
    });
    expect(Object.keys(onSelect.mock.calls[0]![0]).sort()).toEqual([
      "endsAt",
      "professionalId",
      "startsAt",
    ]);
  });

  it("un hueco OCUPADO está deshabilitado, fuera del tabulador y no reserva al hacer click", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid([APPLICATION, EXPOSURE_1]);

    const occupied = screen.getByRole("button", { name: "10:00 — ocupado" });
    expect(occupied).toHaveAttribute("aria-disabled", "true");
    expect(occupied).toHaveAttribute("tabindex", "-1");
    expect(occupied).toHaveAttribute("title", "Hora ya ocupada");

    // El click sobre el hueco no disponible NO selecciona nada (no hay manejador).
    await user.click(occupied);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cada motivo se lee en el aria-label y su pista en el title", () => {
    renderGrid([PAST, APPLICATION, POST, CLOSED]);

    // past → «ya pasada», occupied → «ocupado», closed → «cerrado».
    expect(
      screen.getByRole("button", { name: "09:00 — ya pasada" }),
    ).toHaveAttribute("title", "Esta hora ya ha pasado");
    expect(screen.getByRole("button", { name: "10:00 — ocupado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11:30 — ocupado" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "16:45 — cerrado" }),
    ).toHaveAttribute("title", "Fuera del horario de atención");
  });

  it("un hueco no disponible SIN motivo cae a 'cerrado' por defecto", () => {
    const noReason = daySlot("2026-07-20T08:00:00.000Z", "2026-07-20T08:30:00.000Z", {
      available: false,
    });
    renderGrid([noReason]);
    expect(screen.getByRole("button", { name: "10:00 — cerrado" })).toBeInTheDocument();
  });

  it("sin pasos, muestra el empty state adecuado según el modo", () => {
    // Profesional concreto sin jornada → «no tiene horario».
    renderGrid([]);
    expect(screen.getByText(/no tiene horario de atención/i)).toBeInTheDocument();

    cleanup();

    // «Cualquier profesional» sin libres → «no hay horas libres».
    renderGrid([], { anyProfessional: true });
    expect(screen.getByText(/No hay horas libres este día/i)).toBeInTheDocument();
  });

  it("con pasos pero NINGUNO libre, avisa arriba y deja la rejilla de contexto", () => {
    renderGrid([APPLICATION, POST, CLOSED]);
    expect(screen.getByRole("status")).toHaveTextContent(/No quedan horas libres/i);
    // La rejilla sigue pintándose (contexto), toda deshabilitada.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.every((b) => b.hasAttribute("aria-disabled"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) Contrato: la rejilla completa se ve, pero SOLO los libres son reservables.
//    La exposición de las 3 fases aparece como hueco reservable (por diseño).
// ─────────────────────────────────────────────────────────────────────────────
describe("DaySlots · muestra la jornada completa pero solo reserva los libres", () => {
  it("pinta TODOS los pasos y los reservables son EXACTAMENTE los available:true", () => {
    renderGrid(FULL_DAY);

    // Jornada completa a la vista: 6 celdas.
    expect(screen.getAllByRole("button")).toHaveLength(FULL_DAY.length);

    // Reservables = las celdas sin aria-disabled = los 2 huecos de exposición.
    const reservable = screen
      .getAllByRole("button")
      .filter((b) => !b.hasAttribute("aria-disabled"));
    expect(reservable).toHaveLength(2);
    expect(reservable.map((b) => b.textContent)).toEqual(["10:30", "11:00"]);
  });

  it("el hueco de EXPOSICIÓN de una cita de 3 fases es reservable (por diseño)", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid(FULL_DAY);

    // La exposición ajena (10:30) sale como hueco libre: un servicio corto cabe ahí.
    await user.click(screen.getByRole("button", { name: "10:30" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({
      startsAt: EXPOSURE_1.startsAt,
      endsAt: EXPOSURE_1.endsAt,
      professionalId: PROF,
    });

    // Los tramos OCUPADOS (aplicación/post) NO son reservables.
    await user.click(screen.getByRole("button", { name: "10:00 — ocupado" }));
    await user.click(screen.getByRole("button", { name: "11:30 — ocupado" }));
    expect(onSelect).toHaveBeenCalledTimes(1); // sigue siendo solo la exposición
  });

  it("ni los pasados ni los cerrados son reservables", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderGrid(FULL_DAY);

    await user.click(screen.getByRole("button", { name: "09:00 — ya pasada" }));
    await user.click(screen.getByRole("button", { name: "16:45 — cerrado" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
