/**
 * `ImplantList` — lo que lleva puesto un paciente, y a quién afecta un lote.
 *
 * La misma lista responde a las dos preguntas del Reglamento (UE) 2017/745, y
 * en la segunda —la de la alerta sanitaria— lo que se hace después de mirarla
 * es LLAMAR. Por eso el teléfono tiene que estar aquí y ser marcable: obligar a
 * abrir la ficha de cada paciente convierte diez minutos en una tarde.
 *
 * El lote es el dato que se busca, así que se muestra siempre, incluso cuando
 * falta — "sin lote" es información: ese implante no aparecerá en ninguna
 * búsqueda y alguien tendrá que ir a la caja original.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ImplantList } from "@/components/dental/implant-list";
import type { ImplantRow } from "@/lib/queries/implants";

function implante(extra: Partial<ImplantRow> = {}): ImplantRow {
  return {
    id: "i1",
    fdi_code: 46,
    gtin: "07612345678904",
    lot: "LOT123",
    serial: null,
    ref: "BL-4110",
    brand: "Straumann",
    expiry: "2027-12-31",
    diameter_mm: 4.1,
    length_mm: 10,
    placed_at: "2026-03-15T09:00:00.000Z",
    notes: null,
    customer_id: "c1",
    ...extra,
  } as ImplantRow;
}

afterEach(() => {
  cleanup();
});

describe("ImplantList", () => {
  it("enseña el diente, que es lo primero que se busca", () => {
    render(<ImplantList implants={[implante()]} />);

    expect(screen.getByText(/46/)).toBeInTheDocument();
  });

  it("enseña el lote: es el dato de la alerta sanitaria", () => {
    render(<ImplantList implants={[implante()]} />);

    expect(screen.getByText(/LOT123/)).toBeInTheDocument();
  });

  it("dice «sin lote» en vez de dejar el hueco vacío", () => {
    // Un implante sin lote no saldra en ninguna busqueda: hay que saberlo
    // ahora, no el dia que se necesite.
    render(<ImplantList implants={[implante({ lot: null })]} />);

    expect(screen.getByText(/sin lote/i)).toBeInTheDocument();
  });

  it("enseña marca y medidas, que es lo que pregunta el siguiente profesional", () => {
    render(<ImplantList implants={[implante()]} />);

    expect(screen.getByText(/Straumann/)).toBeInTheDocument();
    expect(screen.getByText(/4,1/)).toBeInTheDocument();
  });

  it("con paciente, su teléfono va marcable de un toque", () => {
    // Modo alerta: lo siguiente que pasa es una llamada.
    render(
      <ImplantList
        implants={[implante({ customer: { full_name: "Ana Ruiz", phone: "600111222" } })]}
        showCustomer
      />,
    );

    const fila = screen.getByTestId("implante-i1");
    expect(within(fila).getByRole("link", { name: /600111222/ })).toHaveAttribute(
      "href",
      "tel:600111222",
    );
  });

  it("un paciente sin teléfono se sigue mostrando", () => {
    render(
      <ImplantList
        implants={[implante({ customer: { full_name: "Ana Ruiz", phone: null } })]}
        showCustomer
      />,
    );

    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
  });

  it("sin implantes lo dice, en vez de dejar una tabla en blanco", () => {
    render(<ImplantList implants={[]} />);

    expect(screen.getByText(/no hay implantes/i)).toBeInTheDocument();
  });
});
