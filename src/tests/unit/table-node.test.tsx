import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
});
