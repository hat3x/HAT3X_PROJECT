import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TableNode } from "@/app/(dashboard)/sala/table-node";
import type { DiningTable } from "@/types/database";

afterEach(() => cleanup());

const TABLE: DiningTable = {
  id: "table-1",
  salon_id: "SALON",
  zone_id: "zone-1",
  name: "Mesa 4",
  capacity_min: 2,
  capacity_max: 4,
  pos_x: 30,
  pos_y: 40,
  shape: "round",
  status: "libre",
  sort_order: 0,
  active: true,
  created_at: "2026-08-10T09:00:00.000Z",
  updated_at: "2026-08-10T09:00:00.000Z",
};

describe("TableNode", () => {
  it("muestra el nombre de la mesa", () => {
    render(createElement(TableNode, { table: TABLE, tone: "free", editable: false, onSelect: vi.fn() }));

    expect(screen.getByText("Mesa 4")).toBeInTheDocument();
  });

  it("aplica el tono recibido como atributo data-tone", () => {
    render(createElement(TableNode, { table: TABLE, tone: "busy", editable: false, onSelect: vi.fn() }));

    expect(screen.getByRole("button")).toHaveAttribute("data-tone", "busy");
  });

  it("con otro tono, refleja ese tono en el atributo", () => {
    render(createElement(TableNode, { table: TABLE, tone: "bill", editable: false, onSelect: vi.fn() }));

    expect(screen.getByRole("button")).toHaveAttribute("data-tone", "bill");
  });

  it("al hacer click (no editable) llama a onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(createElement(TableNode, { table: TABLE, tone: "free", editable: false, onSelect }));

    await user.click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("en modo edición, el click NO llama a onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(createElement(TableNode, { table: TABLE, tone: "free", editable: true, onSelect }));

    await user.click(screen.getByRole("button"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * Fix revisión Task 7 (Minor): un `pointercancel` a mitad de arrastre debía
   * resetear el estado interno de "arrastrando" — sin el handler, el
   * `pointerup` que pudiera llegar después seguía disparando `onDragEnd`
   * (arrastre "fantasma" tras un gesto ya cancelado por el sistema).
   */
  it("un pointercancel a mitad de arrastre no dispara onDragEnd en el pointerup posterior", () => {
    const onDragEnd = vi.fn();
    render(
      createElement(TableNode, {
        table: TABLE,
        tone: "free",
        editable: true,
        onSelect: vi.fn(),
        onDragEnd,
      }),
    );
    const node = screen.getByRole("button");
    // jsdom no calcula layout real: `getBoundingClientRect` del padre
    // devuelve 0x0 por defecto, y con ancho/alto 0 `handlePointerMove` nunca
    // llega a fijar `dragPos` (guarda explícita contra división por cero) —
    // sin un rect de tamaño no nulo, este test "pasaría" igual CON o SIN el
    // fix (onDragEnd nunca se llamaría de todos modos), así que no probaría
    // nada. Se stubea el rect para que el arrastre sí registre posición.
    vi.spyOn(node.parentElement as HTMLElement, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => "",
    } as DOMRect);

    fireEvent.pointerDown(node, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 40, clientY: 60 });
    fireEvent.pointerCancel(node, { pointerId: 1 });
    // Un `pointerup` tardío (p.ej. el sistema lo entrega igualmente tras
    // cancelar) no debe reactivar el arrastre ni llamar a `onDragEnd`.
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 40, clientY: 60 });

    expect(onDragEnd).not.toHaveBeenCalled();
  });
});
