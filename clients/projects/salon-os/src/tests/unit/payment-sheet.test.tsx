import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentSheet } from "@/app/(dashboard)/mostrador/payment-sheet";
import { formatMoney } from "@/lib/format";
import type { SettleTenderInput } from "@/lib/validations/order";

/**
 * `PaymentSheet` no depende de ningún hook de datos (recibe `paymentMethods`
 * por prop), así que no hace falta mockear módulos — a diferencia de
 * `order-panel.test.tsx` (que sí mockea `@/hooks/use-orders`), este test
 * monta el componente "a pelo" (patrón createElement + getByRole).
 */

afterEach(() => cleanup());

/**
 * `formatMoney` (Intl.NumberFormat es-ES) separa el importe del símbolo con
 * un espacio non-breaking (U+00A0), que `getByText` NO normaliza en el string
 * que se le pasa como matcher (ver `order-panel.test.tsx`) — se normaliza a
 * mano aquí también.
 */
const NBSP = " ";
function moneyText(cents: number): string {
  return formatMoney(cents).replaceAll(NBSP, " ");
}

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof PaymentSheet>> = {},
): { onConfirm: ReturnType<typeof vi.fn> } {
  const onConfirm = vi.fn();
  render(
    createElement(PaymentSheet, {
      open: true,
      onOpenChange: vi.fn(),
      totalCents: 1234,
      paymentMethods: [],
      pending: false,
      error: null,
      onConfirm,
      ...overrides,
    }),
  );
  return { onConfirm };
}

describe("PaymentSheet", () => {
  it("efectivo que excede el total: aplica solo el total (no lo entregado) y muestra el cambio", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderSheet({ totalCents: 1234 });

    // Fila inicial: efectivo. Se sustituye el importe (arranca cubriendo el
    // total exacto) por uno que EXCEDE el total: cliente entrega 20,00€ para
    // un total de 12,34€.
    const amountInput = screen.getByLabelText(/entrega/i);
    await user.clear(amountInput);
    await user.type(amountInput, "20,00");

    // El cambio (20,00 - 12,34 = 7,66€) se muestra bajo la fila y en el
    // resumen agregado: ambos textos combinan "Cambio"/"cambio" + el importe
    // en el MISMO nodo ("Cambio: 7,66 €" / "Cobro cuadrado · cambio 7,66 €"),
    // así que se comprueba por `textContent` en vez de un `getByText` exacto
    // (que solo matchea el texto propio de un elemento, sin concatenar).
    const cambioNodes = screen.getAllByText(/cambio/i);
    expect(cambioNodes.length).toBeGreaterThan(0);
    expect(
      cambioNodes.some((el) => el.textContent?.includes(moneyText(766)) === true),
    ).toBe(true);

    // El cobro está cuadrado (el efectivo se topa al total, el resto es
    // cambio) — "Confirmar cobro" debe estar habilitado.
    const confirmButton = screen.getByRole("button", { name: /confirmar cobro/i });
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const tenders = onConfirm.mock.calls[0]![0] as SettleTenderInput[];
    // El tender aplicado es el TOTAL, NUNCA el efectivo entregado (20,00€).
    expect(tenders).toEqual([{ method: "efectivo", amountCents: 1234, paymentMethodId: null }]);
  });

  it("'Confirmar cobro' está deshabilitado hasta que el restante sea 0", async () => {
    const user = userEvent.setup();
    renderSheet({ totalCents: 1000 });

    const amountInput = screen.getByLabelText(/entrega/i);
    const confirmButton = screen.getByRole("button", { name: /confirmar cobro/i });

    // Por debajo del total: falta por cobrar → deshabilitado.
    await user.clear(amountInput);
    await user.type(amountInput, "5,00");
    expect(confirmButton).toBeDisabled();

    // Exactamente el total → habilitado.
    await user.clear(amountInput);
    await user.type(amountInput, "10,00");
    expect(confirmButton).toBeEnabled();
  });

  it("no envía tenders fantasma a 0€: onConfirm recibe solo importes > 0 que suman el total exacto", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderSheet({ totalCents: 1000 });

    // La fila inicial (efectivo) ya cubre el total exacto (10,00€). Añadir
    // OTRO medio de pago sin tocarlo siembra una fila con importe vacío
    // (`addRow`: `remainingCents <= 0` ⇒ `amount: ""`) — el tender fantasma
    // que el servidor (`settleTenderSchema`, `amountCents` debe ser > 0)
    // rechazaría si llegase tal cual.
    await user.click(screen.getByRole("button", { name: /añadir otro medio de pago/i }));

    const confirmButton = screen.getByRole("button", { name: /confirmar cobro/i });
    // El agregado ya cuadra (la fila vacía aporta 0) — el gate de cobertura
    // sigue mirando el AGREGADO, no filas individuales.
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const tenders = onConfirm.mock.calls[0]![0] as SettleTenderInput[];

    expect(tenders.every((t) => t.amountCents > 0)).toBe(true);
    expect(tenders).toHaveLength(1);
    expect(tenders.reduce((acc, t) => acc + t.amountCents, 0)).toBe(1000);
  });
});
