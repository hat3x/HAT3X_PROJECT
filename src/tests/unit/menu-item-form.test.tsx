import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/types/database";

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

/** Producto de edición: priceCents 180 → debe precargarse como "1,80" (no vacío). */
const EDITING_PRODUCT: Product = {
  id: "P1",
  salon_id: "SALON",
  name: "Caña",
  description: null,
  price_cents: 180,
  currency: "EUR",
  vat_rate: 10,
  stock: null,
  min_stock: 0,
  unit: "unidad",
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  category_id: null,
  station_id: null,
  is_combo: false,
  image_url: null,
  allergens: [],
  available_channels: [],
};

describe("MenuItemForm", () => {
  it("no envía si el nombre está vacío y sí envía un producto válido", async () => {
    const user = userEvent.setup();
    render(createElement(MenuItemForm, { salonId: "SALON" }));
    await user.type(screen.getByRole("textbox", { name: /nombre/i }), "Caña");
    await user.type(screen.getByRole("textbox", { name: /precio/i }), "1.80");
    await user.click(screen.getByRole("button", { name: /guardar/i }));
    expect(m.save.mutate).toHaveBeenCalledTimes(1);
    expect(m.save.mutate.mock.calls[0]![0]).toMatchObject({ name: "Caña", priceCents: 180 });
  });

  it("al editar, precarga el precio con coma decimal (no lo deja vacío)", () => {
    render(createElement(MenuItemForm, { salonId: "SALON", product: EDITING_PRODUCT }));
    expect(screen.getByRole("textbox", { name: /precio/i })).toHaveValue("1,80");
  });
});
