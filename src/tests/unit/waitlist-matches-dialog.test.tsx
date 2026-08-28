/**
 * `WaitlistMatchesDialog` — a quién llamar cuando acaban de cancelar (B3).
 *
 * Es el momento en que la lista de espera sirve para algo: se acaba de liberar
 * un hueco y hay que decidir a quién se le ofrece, con el teléfono en la mano.
 *
 * Lo que fijan estos tests:
 *  · El **teléfono es el contenido principal**, marcable de un toque. Todo lo
 *    demás es contexto.
 *  · Se respeta el orden que devuelve el motor —prioridad, y a igualdad quien
 *    lleva más tiempo esperando—. Reordenar aquí por cualquier motivo rompería
 *    la única promesa de justicia que tiene la lista.
 *  · Que no encaje nadie **no es un error**: es información. Se dice y ya.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FreedSlot } from "@/lib/booking/waitlist";
import type { WaitlistEntryWithCustomer } from "@/lib/queries/waitlist";

const m = vi.hoisted(() => ({
  matches: { data: [] as unknown[], isLoading: false },
  status: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-waitlist", () => ({
  useWaitlistMatches: () => m.matches,
  useSetWaitlistStatus: () => m.status,
}));

import { WaitlistMatchesDialog } from "@/components/agenda/waitlist-matches-dialog";

const SALON_ID = "00000000-0000-0000-0000-000000000000";

const HUECO: FreedSlot = {
  startsAt: "2026-09-07T08:00:00.000Z",
  endsAt: "2026-09-07T08:30:00.000Z",
  timeZone: "Europe/Madrid",
  serviceId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  professionalId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
};

function entry(id: string, fullName: string, phone: string | null): WaitlistEntryWithCustomer {
  return {
    id,
    salon_id: SALON_ID,
    customer_id: `c-${id}`,
    service_id: null,
    professional_id: null,
    weekdays: [],
    from_time: null,
    to_time: null,
    priority: 0,
    notes: null,
    status: "esperando",
    expires_at: null,
    notified_at: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    customer: { id: `c-${id}`, full_name: fullName, phone },
  } as WaitlistEntryWithCustomer;
}

beforeEach(() => {
  m.matches = { data: [], isLoading: false };
  m.status = { mutate: vi.fn(), isPending: false };
});

afterEach(() => {
  cleanup();
});

describe("WaitlistMatchesDialog", () => {
  it("si no encaja nadie, lo dice sin tratarlo como un fallo", () => {
    render(<WaitlistMatchesDialog salonId={SALON_ID} slot={HUECO} open onOpenChange={() => {}} />);

    expect(screen.getByText(/nadie de la lista encaja/i)).toBeInTheDocument();
  });

  it("muestra el teléfono marcable de cada candidato", () => {
    m.matches = { data: [entry("w1", "Ana Ruiz", "600111222")], isLoading: false };

    render(<WaitlistMatchesDialog salonId={SALON_ID} slot={HUECO} open onOpenChange={() => {}} />);

    expect(screen.getByRole("link", { name: /600111222/ })).toHaveAttribute(
      "href",
      "tel:600111222",
    );
  });

  it("respeta el orden que da el motor", () => {
    m.matches = {
      data: [entry("w1", "Ana Ruiz", "600111222"), entry("w2", "Luis Soto", "600333444")],
      isLoading: false,
    };

    render(<WaitlistMatchesDialog salonId={SALON_ID} slot={HUECO} open onOpenChange={() => {}} />);

    const nombres = screen.getAllByTestId("candidato-nombre").map((n) => n.textContent);
    expect(nombres).toEqual(["Ana Ruiz", "Luis Soto"]);
  });

  it("marcar como avisado deja constancia con ese estado", () => {
    m.matches = { data: [entry("w1", "Ana Ruiz", "600111222")], isLoading: false };

    render(<WaitlistMatchesDialog salonId={SALON_ID} slot={HUECO} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Marcar como avisada a Ana Ruiz/ }));

    expect(m.status.mutate).toHaveBeenCalledWith(
      { entryId: "w1", status: "avisado" },
      expect.anything(),
    );
  });

  it("un candidato sin teléfono se sigue mostrando", () => {
    // Se le puede avisar por otra vía; ocultarlo lo dejaría fuera sin motivo.
    m.matches = { data: [entry("w1", "Ana Ruiz", null)], isLoading: false };

    render(<WaitlistMatchesDialog salonId={SALON_ID} slot={HUECO} open onOpenChange={() => {}} />);

    const fila = screen.getByTestId("candidato-w1");
    expect(within(fila).getByText("Ana Ruiz")).toBeInTheDocument();
    expect(within(fila).queryByRole("link")).not.toBeInTheDocument();
  });
});
