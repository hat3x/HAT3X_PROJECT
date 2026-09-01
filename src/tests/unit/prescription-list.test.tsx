/**
 * `PrescriptionList` — lista de recetas de un paciente.
 *
 * Igual patrón que `consent-list.test.tsx`: componente CLIENTE que llama
 * directamente a `useIssuePrescription`/`useRevokePrescription`/
 * `useDeletePrescription` (cada fila necesita su propio botón) — se
 * sustituyen por stubs (`vi.hoisted`). `usePrescriptionItems` (renglones, solo
 * al expandir) se mockea también, ya que el detalle de esos renglones no es
 * el objeto de este test.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Prescription } from "@/types/database";

// Mutaciones (hoisted): objetos ESTABLES cuyos campos se reinician en cada
// test, igual patrón que `consent-list.test.tsx`.
const m = vi.hoisted(() => ({
  issue: { mutate: vi.fn(), isPending: false },
  revoke: { mutate: vi.fn(), isPending: false },
  del: { mutate: vi.fn(), isPending: false },
  items: { data: [] as unknown[], isLoading: false, isError: false },
}));

vi.mock("@/hooks/use-prescriptions", () => ({
  useIssuePrescription: () => m.issue,
  useRevokePrescription: () => m.revoke,
  useDeletePrescription: () => m.del,
  usePrescriptionItems: () => m.items,
}));

import { PrescriptionList } from "@/components/dental/prescription-list";

beforeEach(() => {
  m.issue.mutate = vi.fn();
  m.issue.isPending = false;
  m.revoke.mutate = vi.fn();
  m.revoke.isPending = false;
  m.del.mutate = vi.fn();
  m.del.isPending = false;
  m.items = { data: [], isLoading: false, isError: false };
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function prescription(overrides: Partial<Prescription> & { id: string }): Prescription {
  return {
    salon_id: "salon-1",
    customer_id: "customer-1",
    prescriber_id: null,
    prescriber_license: null,
    prescriber_authority: null,
    prescriber_name: "Dra. Ana Ruiz",
    diagnosis: "Pulpitis irreversible 26",
    notes: null,
    status: "draft",
    issued_at: null,
    signed_by: null,
    revoked_at: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const DRAFT = prescription({ id: "rx-1", diagnosis: "Pulpitis irreversible 26", status: "draft" });
const ISSUED = prescription({
  id: "rx-2",
  diagnosis: "Absceso periapical 46",
  status: "issued",
  issued_at: "2026-08-01T11:00:00.000Z",
});
const REVOKED = prescription({
  id: "rx-3",
  diagnosis: "Profilaxis prequirúrgica",
  status: "revoked",
  issued_at: "2026-07-01T11:00:00.000Z",
  revoked_at: "2026-08-01T12:00:00.000Z",
});

function renderList(prescriptions: Prescription[]): void {
  render(
    createElement(PrescriptionList, { salonId: "salon-1", customerId: "customer-1", prescriptions }),
  );
}

/** Localiza la `Card` (vía su título) que contiene los controles de una receta. */
function prescriptionCard(titleText: string): HTMLElement {
  const title = screen.getByText(titleText);
  const card = title.closest<HTMLDivElement>("div.space-y-2");
  if (card === null) throw new Error(`no se encontró la tarjeta de la receta "${titleText}"`);
  return card;
}

describe("PrescriptionList · estados, badges y acciones", () => {
  it("vacío → empty state", () => {
    renderList([]);
    expect(screen.getByText("Sin recetas todavía")).toBeInTheDocument();
  });

  it("renderiza N recetas con su diagnóstico como título y el badge de estado", () => {
    renderList([DRAFT, ISSUED, REVOKED]);

    expect(screen.getByText("Pulpitis irreversible 26")).toBeInTheDocument();
    expect(screen.getByText("Absceso periapical 46")).toBeInTheDocument();
    expect(screen.getByText("Profilaxis prequirúrgica")).toBeInTheDocument();

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Emitida")).toBeInTheDocument();
    expect(screen.getByText("Revocada")).toBeInTheDocument();
  });

  it("sin diagnóstico ⇒ título por defecto 'Receta'", () => {
    renderList([prescription({ id: "rx-4", diagnosis: null })]);
    expect(screen.getByText("Receta")).toBeInTheDocument();
  });

  it("draft: muestra Emitir y Borrar, no Revocar", () => {
    renderList([DRAFT]);
    const card = prescriptionCard("Pulpitis irreversible 26");

    expect(within(card).getByRole("button", { name: "Emitir" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Borrar" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Revocar" })).toBeNull();
  });

  it("issued: muestra Revocar, no Emitir ni Borrar", () => {
    renderList([ISSUED]);
    const card = prescriptionCard("Absceso periapical 46");

    expect(within(card).getByRole("button", { name: "Revocar" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Emitir" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Borrar" })).toBeNull();
  });

  it("revoked: no muestra ninguna de las tres acciones", () => {
    renderList([REVOKED]);
    const card = prescriptionCard("Profilaxis prequirúrgica");

    expect(within(card).queryByRole("button", { name: "Emitir" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Revocar" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Borrar" })).toBeNull();
  });

  it("al pulsar Emitir, llama a useIssuePrescription con el id de la receta", () => {
    renderList([DRAFT]);
    const card = prescriptionCard("Pulpitis irreversible 26");

    fireEvent.click(within(card).getByRole("button", { name: "Emitir" }));

    expect(m.issue.mutate).toHaveBeenCalledTimes(1);
    expect(m.issue.mutate).toHaveBeenCalledWith(
      "rx-1",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("al pulsar Revocar, llama a useRevokePrescription con el id de la receta", () => {
    renderList([ISSUED]);
    const card = prescriptionCard("Absceso periapical 46");

    fireEvent.click(within(card).getByRole("button", { name: "Revocar" }));

    expect(m.revoke.mutate).toHaveBeenCalledTimes(1);
    expect(m.revoke.mutate).toHaveBeenCalledWith(
      "rx-2",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("al pulsar Borrar, llama a useDeletePrescription con el id de la receta", () => {
    renderList([DRAFT]);
    const card = prescriptionCard("Pulpitis irreversible 26");

    fireEvent.click(within(card).getByRole("button", { name: "Borrar" }));

    expect(m.del.mutate).toHaveBeenCalledTimes(1);
    expect(m.del.mutate).toHaveBeenCalledWith(
      "rx-1",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("al expandir 'Ver renglones' muestra los renglones de medicación (usePrescriptionItems)", () => {
    m.items = {
      data: [
        {
          id: "item-1",
          salon_id: "salon-1",
          prescription_id: "rx-1",
          position: 0,
          medication: "Amoxicilina 500 mg",
          dose: "1 comprimido",
          frequency: "cada 8 h",
          duration: "7 días",
          quantity: null,
          instructions: null,
        },
      ],
      isLoading: false,
      isError: false,
    };
    renderList([DRAFT]);
    const card = prescriptionCard("Pulpitis irreversible 26");

    fireEvent.click(within(card).getByRole("button", { name: "Ver renglones" }));

    expect(within(card).getByText("Amoxicilina 500 mg")).toBeInTheDocument();
    expect(within(card).getByText(/1 comprimido/)).toBeInTheDocument();
  });

  it("expandir sin renglones ⇒ mensaje 'Sin renglones de medicación todavía.'", () => {
    renderList([DRAFT]);
    const card = prescriptionCard("Pulpitis irreversible 26");

    fireEvent.click(within(card).getByRole("button", { name: "Ver renglones" }));

    expect(within(card).getByText("Sin renglones de medicación todavía.")).toBeInTheDocument();
  });
});
