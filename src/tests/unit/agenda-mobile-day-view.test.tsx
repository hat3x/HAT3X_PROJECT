/**
 * `AgendaMobileDay` — la agenda del día en el móvil.
 *
 * Las capturas del problema que resuelve: en la parrilla encogida las citas
 * salían como manchas de color SIN TEXTO, las columnas se cortaban a media
 * palabra ("Javier Fernan…") y la hora se solapaba con el nombre. Es decir, la
 * pantalla no respondía a la única pregunta que se le hace desde el móvil:
 * quién viene, cuándo y con quién.
 *
 * Por eso estos tests van sobre el CONTENIDO visible, no sobre la maquetación:
 * si un dato no se lee, la pantalla no sirve, por bonita que quede.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaMobileDay } from "@/components/agenda/agenda-mobile-day";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

const TZ = "Europe/Madrid";

/** Cita del 29/08/2026 a la hora local indicada. Agosto en Madrid es UTC+2. */
function cita(
  id: string,
  horaLocal: string,
  minutos: number,
  extra: Record<string, unknown> = {},
): AppointmentWithDetails {
  const [h, m] = horaLocal.split(":").map(Number) as [number, number];
  const inicio = new Date(Date.UTC(2026, 7, 29, h - 2, m));
  const fin = new Date(inicio.getTime() + minutos * 60_000);
  return {
    id,
    starts_at: inicio.toISOString(),
    ends_at: fin.toISOString(),
    status: "pending",
    notes: null,
    customer: { id: "c-" + id, full_name: "Nuria Moruno", phone: "600111222" },
    professional: { id: "p1", full_name: "Raquel Lázaro", color: "#3366ff" },
    service: { id: "s1", name: "Varios mujer" },
    ...extra,
  } as unknown as AppointmentWithDetails;
}

function pintar(props: Partial<React.ComponentProps<typeof AgendaMobileDay>> = {}) {
  const onSelect = vi.fn();
  render(
    <AgendaMobileDay
      appointments={[cita("a", "10:30", 90)]}
      timezone={TZ}
      isLoading={false}
      isError={false}
      onSelectAppointment={onSelect}
      {...props}
    />,
  );
  return { onSelect };
}

afterEach(() => {
  cleanup();
});

describe("AgendaMobileDay", () => {
  it("enseña la hora de la cita, que en la parrilla encogida no se leía", () => {
    pintar();

    expect(screen.getByText("10:30–12:00")).toBeInTheDocument();
  });

  it("enseña a quién se atiende", () => {
    pintar();

    expect(screen.getByText("Nuria Moruno")).toBeInTheDocument();
  });

  it("enseña el servicio y cuánto dura", () => {
    pintar();

    expect(screen.getByText(/Varios mujer/)).toBeInTheDocument();
    expect(screen.getByText(/90 min/)).toBeInTheDocument();
  });

  it("enseña con quién es la cita: sin eso hay que abrirla para saberlo", () => {
    pintar();

    expect(screen.getByText("Raquel Lázaro")).toBeInTheDocument();
  });

  it("agrupa el día por franjas horarias", () => {
    pintar({ appointments: [cita("a", "10:30", 30), cita("b", "12:15", 30)] });

    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
  });

  it("dos citas a la vez son dos filas legibles, no dos manchas", () => {
    pintar({ appointments: [cita("a", "11:00", 60), cita("b", "11:00", 60)] });

    expect(screen.getAllByRole("button", { name: /Nuria Moruno/ })).toHaveLength(2);
  });

  it("tocar una cita abre su ficha", () => {
    const { onSelect } = pintar();

    fireEvent.click(screen.getByRole("button", { name: /Nuria Moruno/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: "a" });
  });

  it("una cancelada se distingue de una viva", () => {
    pintar({ appointments: [cita("anulada", "10:30", 30, { status: "cancelled" })] });

    const fila = screen.getByRole("button", { name: /Nuria Moruno/ });
    expect(within(fila).getByText(/cancelada/i)).toBeInTheDocument();
  });

  it("un día vacío dice que está libre, no se queda en blanco", () => {
    pintar({ appointments: [] });

    expect(screen.getByText(/no hay citas/i)).toBeInTheDocument();
  });

  it("si la consulta falla lo dice, en vez de fingir un día sin citas", () => {
    // Confundir "error" con "día libre" haría que alguien diera por vacía una
    // agenda llena.
    pintar({ appointments: [], isError: true });

    expect(screen.getByText(/no se pudo cargar/i)).toBeInTheDocument();
    expect(screen.queryByText(/no hay citas/i)).not.toBeInTheDocument();
  });
});
