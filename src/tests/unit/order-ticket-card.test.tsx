import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kdsKeys } from "@/lib/queries/kds";
import type { KdsOrderGroup } from "@/lib/restauracion/kds";

/**
 * Mock de `@/hooks/use-orders` (patrón `order-panel.test.tsx` / `menu-item-form.test.tsx`,
 * vi.hoisted + createElement + getByRole): `OrderTicketCard` llama a
 * `useSetOrderItemStatus` directamente, así que el test no necesita
 * `QueryClientProvider`. Mockeamos también `useQueryClient` de
 * `@tanstack/react-query` (fix del refresco instantáneo del KDS): el
 * componente lo llama para invalidar `kdsKeys.all(salonId)` en el
 * `onSuccess` de la mutation — sin este mock, `useQueryClient` real lanzaría
 * "No QueryClient set" al no haber `QueryClientProvider` en el árbol.
 */
const m = vi.hoisted(() => ({
  setOrderItemStatus: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-orders", () => ({
  useSetOrderItemStatus: () => m.setOrderItemStatus,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => m.queryClient,
}));

import { OrderTicketCard } from "@/app/(dashboard)/cocina/order-ticket-card";

beforeEach(() => {
  m.setOrderItemStatus.mutate = vi.fn();
  m.queryClient.invalidateQueries = vi.fn();
});
afterEach(() => cleanup());

const NOW = new Date("2026-08-09T12:10:00.000Z");

/** Un pedido (#42, mesa "Mesa 3") con una única línea en el estado dado. */
function groupWith(status: "enviado" | "listo"): KdsOrderGroup {
  return {
    orderId: "order-1",
    orderNumber: 42,
    orderLabel: "Mesa 3",
    createdAt: "2026-08-09T12:00:00.000Z",
    items: [
      {
        id: "item-1",
        orderId: "order-1",
        orderNumber: 42,
        orderLabel: "Mesa 3",
        stationId: "st-1",
        stationName: "Cocina",
        productName: "Hamburguesa",
        qty: 2,
        status,
        modifiers: [],
        createdAt: "2026-08-09T12:00:00.000Z",
      },
    ],
  };
}

describe("OrderTicketCard", () => {
  it("un ítem 'enviado' muestra Entregar y al pulsarlo pide pasar a 'listo'", async () => {
    const user = userEvent.setup();
    render(createElement(OrderTicketCard, { salonId: "SALON", group: groupWith("enviado"), now: NOW }));

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(/hamburguesa/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /entregar/i }));

    expect(m.setOrderItemStatus.mutate).toHaveBeenCalledTimes(1);
    expect(m.setOrderItemStatus.mutate.mock.calls[0]![0]).toMatchObject({
      itemId: "item-1",
      from: "enviado",
      to: "listo",
    });

    // Fix "el KDS no se refresca al Entregar/Entregado": el segundo argumento
    // de `mutate` es un `onSuccess` que invalida `kdsKeys.all(salonId)` para
    // refrescar la pantalla al instante (sin depender del roundtrip de
    // Realtime). Invocamos aquí el callback capturado, como haría react-query
    // real al resolver la mutation.
    const options = m.setOrderItemStatus.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();
    expect(m.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: kdsKeys.all("SALON") });
  });

  it("un ítem 'listo' muestra Entregado y al pulsarlo pide pasar a 'entregado'", async () => {
    const user = userEvent.setup();
    render(createElement(OrderTicketCard, { salonId: "SALON", group: groupWith("listo"), now: NOW }));

    await user.click(screen.getByRole("button", { name: /entregado/i }));

    expect(m.setOrderItemStatus.mutate).toHaveBeenCalledTimes(1);
    expect(m.setOrderItemStatus.mutate.mock.calls[0]![0]).toMatchObject({
      itemId: "item-1",
      from: "listo",
      to: "entregado",
    });

    const options = m.setOrderItemStatus.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();
    expect(m.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: kdsKeys.all("SALON") });
  });
});
