/**
 * Modo edición de la agenda.
 *
 * La agenda se maneja a diario con el dedo y el teléfono en la otra mano. Con
 * las tarjetas siempre arrastrables, un roce mueve la cita de una paciente a
 * otra hora sin que nadie se entere: el gesto de "desplazar la agenda para ver
 * la tarde" y el de "mover esta cita" son el mismo movimiento.
 *
 * Por eso la agenda arranca en SOLO LECTURA y hay que pedir editar
 * explícitamente. Consultar —abrir una cita, ver el día— no exige nada; solo
 * se protege lo que modifica.
 *
 * Lo que fija este test:
 *  · por defecto NO se puede arrastrar ni redimensionar;
 *  · al activar el modo, sí;
 *  · abrir la ficha de una cita funciona en los dos modos, porque mirar no
 *    puede costar un clic de más.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import type { MemberRole, SalonSector } from "@/types/database";

const SALON = "00000000-0000-0000-0000-000000000000";
const PRO = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CITA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PACIENTE = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SERVICIO = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const h = vi.hoisted(() => ({
  appointments: [] as unknown[],
  professionals: [] as unknown[],
  // Dentro del bloque hoisteado: las fábricas de `vi.mock` se elevan al inicio
  // del fichero y no ven variables declaradas después.
  mutacion: () => ({ mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }),
}));

vi.mock("@/hooks/use-appointments", () => ({
  useAppointments: () => ({ data: h.appointments, isLoading: false, isError: false }),
  useProfessionals: () => ({ data: h.professionals, isLoading: false, isError: false }),
  useDeleteAppointment: h.mutacion,
  useRescheduleAppointment: h.mutacion,
  useSendAppointmentReminder: h.mutacion,
  useUpdateAppointmentNotes: h.mutacion,
  useUpdateAppointmentStatus: h.mutacion,
}));

vi.mock("@/hooks/use-schedules", () => ({
  useSalonSchedule: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/use-day-panel-realtime", () => ({ useDayPanelRealtime: () => undefined }));
vi.mock("@/hooks/use-ortho-payments", () => ({
  useOverdueOrtho: () => ({ data: {}, isLoading: false }),
}));
vi.mock("@/hooks/use-waitlist", () => ({
  useWaitlist: () => ({ data: [], isLoading: false }),
  useWaitlistMatches: () => ({ data: [], isLoading: false }),
  useSetWaitlistStatus: h.mutacion,
  useAddToWaitlist: h.mutacion,
}));
vi.mock("@/hooks/use-customers", () => ({
  useCustomerSearch: () => ({ data: [], isLoading: false }),
}));

import { AppointmentsView } from "@/app/(dashboard)/appointments/appointments-view";

/** Una cita de hoy, de media hora, a media mañana. */
function cita(): AppointmentWithDetails {
  const hoy = new Date();
  const inicio = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 8, 0, 0),
  );
  const fin = new Date(inicio.getTime() + 30 * 60_000);
  return {
    id: CITA,
    salon_id: SALON,
    customer_id: PACIENTE,
    professional_id: PRO,
    service_id: SERVICIO,
    starts_at: inicio.toISOString(),
    ends_at: fin.toISOString(),
    status: "confirmed",
    notes: null,
    customer: { id: PACIENTE, full_name: "Ana Ruiz", phone: null },
    professional: { id: PRO, full_name: "Raquel", color: "#3366ff" },
    service: { id: SERVICIO, name: "Corte", duration_minutes: 30 },
  } as unknown as AppointmentWithDetails;
}

function pintar(): void {
  render(
    <AppointmentsView
      salonId={SALON}
      salonSlug="espiral"
      timezone="Europe/Madrid"
      role={"owner" as MemberRole}
      sector={"peluqueria" as SalonSector}
    />,
  );
}

beforeEach(() => {
  h.appointments = [cita()];
  h.professionals = [{ id: PRO, full_name: "Raquel", color: "#3366ff", active: true }];
});

afterEach(() => {
  cleanup();
});

describe("modo edición de la agenda", () => {
  it("arranca en solo lectura: la cita no se puede arrastrar", () => {
    pintar();

    const tarjeta = screen.getByRole("button", { name: /Ana Ruiz/ });
    expect(tarjeta.querySelector("[data-grip]")).toBeNull();
    expect(tarjeta.className).toContain("cursor-default");
  });

  it("ofrece activar la edición", () => {
    pintar();

    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
  });

  it("con la edición activada, la cita ya se puede arrastrar y redimensionar", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));

    const tarjeta = screen.getByRole("button", { name: /Ana Ruiz/ });
    expect(tarjeta.querySelector("[data-grip]")).not.toBeNull();
    expect(tarjeta.className).toContain("cursor-grab");
  });

  it("se puede volver a bloquear", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));

    const tarjeta = screen.getByRole("button", { name: /Ana Ruiz/ });
    expect(tarjeta.querySelector("[data-grip]")).toBeNull();
  });
});
