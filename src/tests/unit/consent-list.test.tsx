/**
 * `ConsentList` — lista de consentimientos informados de un paciente.
 *
 * A diferencia de `PerioSummary`/`PerioHistory` (presentacionales puros), este
 * componente llama directamente a `useSignConsent`/`useRevokeConsent` (cada
 * fila necesita su propio botón) — se sustituyen por stubs, igual patrón que
 * `plan-detail.test.tsx`/`odontogram-chart.test.tsx`. El borrado (`deleteConsent`)
 * no tiene hook en `use-consents.ts`: el componente lo envuelve con un
 * `useMutation` local, así que necesita un `QueryClientProvider` real de fondo
 * (igual patrón que `booking-wizard.test.tsx`) aunque las mutaciones de
 * firmar/revocar sigan mockeadas.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Consent } from "@/types/database";

// Mutaciones (hoisted): objetos ESTABLES cuyos campos se reinician en cada
// test, igual patrón que `plan-detail.test.tsx`.
const m = vi.hoisted(() => ({
  sign: { mutate: vi.fn(), isPending: false },
  revoke: { mutate: vi.fn(), isPending: false },
  deleteConsent: vi.fn(),
}));

vi.mock("@/hooks/use-consents", () => ({
  useSignConsent: () => m.sign,
  useRevokeConsent: () => m.revoke,
}));

vi.mock("@/app/(dashboard)/expediente/actions", () => ({
  deleteConsent: (consentId: string) => m.deleteConsent(consentId),
}));

import { ConsentList } from "@/components/dental/consent-list";

beforeEach(() => {
  m.sign.mutate = vi.fn();
  m.sign.isPending = false;
  m.revoke.mutate = vi.fn();
  m.revoke.isPending = false;
  m.deleteConsent = vi.fn(async (id: string) => ({ ok: true, data: { id } }));
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function consent(overrides: Partial<Consent> & { id: string }): Consent {
  return {
    salon_id: "salon-1",
    customer_id: "customer-1",
    type: "general",
    treatment_plan_id: null,
    plan_item_id: null,
    fdi_code: null,
    title: "Consentimiento informado general de tratamiento odontológico",
    body: "Texto legal del consentimiento…",
    template_version: "v1",
    document_uri: null,
    status: "pending",
    signed_at: null,
    signed_by_patient: null,
    witnessed_by: null,
    revoked_at: null,
    revoked_by: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const PENDING = consent({ id: "consent-1", type: "general", status: "pending" });
const SIGNED = consent({
  id: "consent-2",
  type: "endodoncia",
  status: "signed",
  signed_at: "2026-08-01T11:00:00.000Z",
  signed_by_patient: "María López",
});
const REVOKED = consent({
  id: "consent-3",
  type: "implante",
  status: "revoked",
  signed_at: "2026-07-01T11:00:00.000Z",
  signed_by_patient: "María López",
  revoked_at: "2026-08-01T12:00:00.000Z",
});

function renderList(consents: Consent[]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ConsentList, { salonId: "salon-1", customerId: "customer-1", consents }),
    ),
  );
}

/** Localiza la `Card` (vía su título) que contiene los controles de un consentimiento. */
function consentCard(titleText: string): HTMLElement {
  const title = screen.getByText(titleText);
  // El título vive dentro de CardContent; buscamos el ancestro más cercano con los botones.
  const card = title.closest<HTMLDivElement>("div.space-y-2");
  if (card === null) throw new Error(`no se encontró la tarjeta del consentimiento "${titleText}"`);
  return card;
}

describe("ConsentList · estados, badges y acciones", () => {
  it("vacío → empty state", () => {
    renderList([]);
    expect(screen.getByText("Sin consentimientos todavía")).toBeInTheDocument();
  });

  it("renderiza N consentimientos con su tipo como título y el badge de estado", () => {
    renderList([PENDING, SIGNED, REVOKED]);

    expect(screen.getByText("Consentimiento general")).toBeInTheDocument();
    expect(screen.getByText("Endodoncia")).toBeInTheDocument();
    expect(screen.getByText("Implante dental")).toBeInTheDocument();

    expect(screen.getByText("Pendiente de firma")).toBeInTheDocument();
    expect(screen.getByText("Firmado")).toBeInTheDocument();
    expect(screen.getByText("Revocado")).toBeInTheDocument();
  });

  it("pending: muestra Firmar y Borrar, no Revocar", () => {
    renderList([PENDING]);
    const card = consentCard("Consentimiento general");

    expect(within(card).getByRole("button", { name: "Firmar" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Borrar" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Revocar" })).toBeNull();
  });

  it("signed: muestra Revocar, no Firmar ni Borrar", () => {
    renderList([SIGNED]);
    const card = consentCard("Endodoncia");

    expect(within(card).getByRole("button", { name: "Revocar" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Firmar" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Borrar" })).toBeNull();
  });

  it("revoked: no muestra ninguna de las tres acciones", () => {
    renderList([REVOKED]);
    const card = consentCard("Implante dental");

    expect(within(card).queryByRole("button", { name: "Firmar" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Revocar" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Borrar" })).toBeNull();
  });

  it("al firmar con un nombre, llama a useSignConsent con {consentId, signedByPatient}", () => {
    renderList([PENDING]);
    const card = consentCard("Consentimiento general");

    fireEvent.click(within(card).getByRole("button", { name: "Firmar" }));

    const input = within(card).getByLabelText("Nombre del paciente que firma");
    fireEvent.change(input, { target: { value: "Ana Pérez" } });
    fireEvent.click(within(card).getByRole("button", { name: "Confirmar firma" }));

    expect(m.sign.mutate).toHaveBeenCalledTimes(1);
    expect(m.sign.mutate).toHaveBeenCalledWith(
      { consentId: "consent-1", signedByPatient: "Ana Pérez" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("el botón de confirmar firma está deshabilitado sin nombre", () => {
    renderList([PENDING]);
    const card = consentCard("Consentimiento general");

    fireEvent.click(within(card).getByRole("button", { name: "Firmar" }));

    expect(within(card).getByRole("button", { name: "Confirmar firma" })).toBeDisabled();
  });
});
