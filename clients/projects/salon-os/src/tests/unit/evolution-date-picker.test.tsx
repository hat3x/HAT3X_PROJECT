/**
 * `EvolutionDatePicker` — selector de fecha del evolutivo "boca en fecha X"
 * del odontograma. Componente controlado y sin estado propio: solo verifica
 * que refleja `value` en el input y que dispara `onChange` con la fecha
 * elegida o con `null` al pulsar "Hoy" (vuelta al estado ACTUAL).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvolutionDatePicker } from "@/components/dental/evolution-date-picker";

afterEach(() => {
  cleanup();
});

describe("EvolutionDatePicker", () => {
  it("cambiar el input de fecha dispara onChange con la fecha elegida", () => {
    const onChange = vi.fn();
    render(createElement(EvolutionDatePicker, { value: null, onChange }));

    const input = screen.getByLabelText("Boca en fecha:");
    fireEvent.change(input, { target: { value: "2026-03-15" } });

    expect(onChange).toHaveBeenCalledWith("2026-03-15");
  });

  it("pulsar 'Hoy' dispara onChange(null), sea cual sea el value actual", () => {
    const onChange = vi.fn();
    render(createElement(EvolutionDatePicker, { value: "2026-03-15", onChange }));

    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("con value null, el input se muestra vacío (estado actual)", () => {
    render(createElement(EvolutionDatePicker, { value: null, onChange: vi.fn() }));

    const input = screen.getByLabelText("Boca en fecha:") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("con value presente, el input lo muestra", () => {
    render(
      createElement(EvolutionDatePicker, { value: "2026-03-15", onChange: vi.fn() }),
    );

    const input = screen.getByLabelText("Boca en fecha:") as HTMLInputElement;
    expect(input.value).toBe("2026-03-15");
  });
});
