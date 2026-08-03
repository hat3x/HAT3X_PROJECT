/**
 * Ajustes → Complementos — LECTURA de entitlements reflejada en la UI (sub-7).
 *
 * `listSalonFeatures` (la LECTURA de datos) ya se fija en `salon-features.test.ts`:
 * mapea cada add-on a su `enabled` y distingue los tres estados. Aquí se prueba que el
 * COMPONENTE de vista `ComplementosView` (sub-5) traduce ESE mapa a la presentación
 * correcta, que es lo que ve el salón:
 *
 *   · un add-on presente y activo  ⇒ badge "Contratado";
 *   · presente pero pausado        ⇒ badge "En pausa";
 *   · AUSENTE del mapa             ⇒ badge "No contratado" (no se ofrece como activo).
 *
 * Se comprueba en particular la FIDELIZACIÓN: cuando el add-on `loyalty` NO está
 * contratado, la vista lo refleja como "No contratado" y NUNCA como activo — coherente
 * con el gate que oculta el acceso a fidelización en la ficha de cliente cuando falta
 * el add-on (`customer-loyalty-gate.test.ts`). El contador "X de 5" resume el estado.
 *
 * Componente presentacional PURO (sin hooks ni red): se renderiza con un mapa sintético.
 */
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ComplementosView } from "@/app/(dashboard)/ajustes/complementos/complementos-view";
import type { SalonFeature } from "@/types/database";

afterEach(() => {
  cleanup();
});

/**
 * Renderiza la vista con un mapa `feature → enabled` (ausencia = no contratado) y,
 * opcionalmente, el nombre de la recepcionista IA vinculada (para las pruebas de la
 * línea de verificación en la tarjeta de Recepcionista IA).
 */
function renderView(
  entries: ReadonlyArray<[SalonFeature, boolean]>,
  receptionistName?: string | null,
): void {
  render(
    createElement(ComplementosView, {
      features: new Map<SalonFeature, boolean>(entries),
      receptionistName,
    }),
  );
}

/** La tarjeta (`<li>`) que contiene el add-on con nombre comercial `name`. */
function cardFor(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const card = heading.closest("li");
  if (card === null) throw new Error(`sin tarjeta para el add-on «${name}»`);
  return card;
}

describe("ComplementosView · la UI refleja los add-ons contratados", () => {
  it("distingue contratado / en pausa / no contratado según el mapa", () => {
    // loyalty activo, pos pausado; el resto (client_app, staff_app, ai_receptionist)
    // ausente del mapa ⇒ no contratado.
    renderView([
      ["loyalty", true],
      ["pos", false],
    ]);

    expect(within(cardFor("Fidelización")).getByText("Contratado")).toBeInTheDocument();
    expect(within(cardFor("TPV")).getByText("En pausa")).toBeInTheDocument();
    expect(
      within(cardFor("App de cliente")).getByText("No contratado"),
    ).toBeInTheDocument();

    // Contador resumen: 2 de 5 (loyalty + pos cuentan; los ausentes no).
    expect(screen.getByText(/2 de 5/)).toBeInTheDocument();
  });

  it("con TODOS los add-ons activos ⇒ 5 de 5 y cinco badges 'Contratado'", () => {
    renderView([
      ["loyalty", true],
      ["client_app", true],
      ["staff_app", true],
      ["ai_receptionist", true],
      ["pos", true],
    ]);

    expect(screen.getAllByText("Contratado")).toHaveLength(5);
    expect(screen.getByText(/5 de 5/)).toBeInTheDocument();
    expect(screen.queryByText("No contratado")).toBeNull();
  });
});

describe("ComplementosView · la fidelización ausente NO se ofrece como activa", () => {
  it("sin ningún add-on, la fidelización figura como 'No contratado' (0 de 5)", () => {
    renderView([]); // mapa vacío: ningún entitlement

    // La tarjeta de fidelización existe pero está marcada como no contratada.
    expect(
      within(cardFor("Fidelización")).getByText("No contratado"),
    ).toBeInTheDocument();
    // Y en ningún add-on se pinta el estado activo (nada "Contratado").
    expect(screen.queryByText("Contratado")).toBeNull();
    expect(screen.getAllByText("No contratado")).toHaveLength(5);
    expect(screen.getByText(/0 de 5/)).toBeInTheDocument();
  });

  it("la fidelización pausada (enabled=false) NO aparece como 'Contratado'", () => {
    renderView([["loyalty", false]]);

    const card = cardFor("Fidelización");
    expect(within(card).getByText("En pausa")).toBeInTheDocument();
    expect(within(card).queryByText("Contratado")).toBeNull();
    // Un add-on pausado sí cuenta como contratado (1 de 5): está en el plan, suspendido.
    expect(screen.getByText(/1 de 5/)).toBeInTheDocument();
  });
});

describe("ComplementosView · verificación del nombre de la recepcionista IA", () => {
  it("con el add-on activo y nombre, la tarjeta de Recepcionista IA muestra el nombre", () => {
    renderView([["ai_receptionist", true]], "Sara");

    const card = cardFor("Recepcionista IA");
    expect(within(card).getByText("Sara")).toBeInTheDocument();
    expect(
      within(card).getByText(/Recepcionista vinculada/i),
    ).toBeInTheDocument();
  });

  it("el nombre aparece SOLO en la tarjeta de Recepcionista IA, no en otras", () => {
    renderView(
      [
        ["ai_receptionist", true],
        ["pos", true],
      ],
      "Sara",
    );

    expect(
      within(cardFor("Recepcionista IA")).getByText("Sara"),
    ).toBeInTheDocument();
    expect(within(cardFor("TPV")).queryByText("Sara")).toBeNull();
  });

  it("con el add-on activo pero SIN nombre, no se pinta la línea de verificación", () => {
    renderView([["ai_receptionist", true]]); // sin receptionistName

    expect(screen.queryByText(/Recepcionista vinculada/i)).toBeNull();
  });

  it("aunque llegue un nombre, si el add-on está EN PAUSA no se muestra (no vinculada activa)", () => {
    renderView([["ai_receptionist", false]], "Sara");

    const card = cardFor("Recepcionista IA");
    expect(within(card).getByText("En pausa")).toBeInTheDocument();
    expect(within(card).queryByText("Sara")).toBeNull();
    expect(screen.queryByText(/Recepcionista vinculada/i)).toBeNull();
  });

  it("si el add-on NO está contratado, un nombre suelto NO aparece", () => {
    renderView([], "Sara"); // ai_receptionist ausente ⇒ no contratado

    expect(screen.queryByText("Sara")).toBeNull();
    expect(screen.queryByText(/Recepcionista vinculada/i)).toBeNull();
  });
});
