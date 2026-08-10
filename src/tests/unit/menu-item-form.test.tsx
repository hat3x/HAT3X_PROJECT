import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  save: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  categories: { data: [{ id: "C1", name: "Bebidas" }], isPending: false },
  stations: { data: [{ id: "S1", name: "Barra" }], isPending: false },
}));
vi.mock("@/hooks/use-menu", () => ({
  useSaveMenuProduct: () => m.save,
  useMenuCategories: () => m.categories,
  useStations: () => m.stations,
}));
import { MenuItemForm } from "@/app/(dashboard)/carta/menu-item-form";

beforeEach(() => { m.save.mutate = vi.fn(); });
afterEach(() => cleanup());

describe("MenuItemForm", () => {
  it("no envía si el nombre está vacío y sí envía un producto válido", async () => {
    const user = userEvent.setup();
    render(createElement(MenuItemForm, { salonId: "SALON" }));
    await user.type(screen.getByRole("textbox", { name: /nombre/i }), "Caña");
    await user.type(screen.getByRole("spinbutton", { name: /precio/i }), "1.80");
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    expect(m.save.mutate).toHaveBeenCalledTimes(1);
    expect(m.save.mutate.mock.calls[0]![0]).toMatchObject({ name: "Caña", priceCents: 180 });
  });
});
