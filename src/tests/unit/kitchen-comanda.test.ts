import { describe, it, expect } from "vitest";
import { buildKitchenComandaHtml } from "@/lib/restauracion/kitchen-comanda";

it("incluye número de pedido, estación, líneas y modificadores; SIN precios", () => {
  const html = buildKitchenComandaHtml({
    orderNumber: 42, stationName: "Cocina", label: "Barra 3",
    issuedAt: new Date("2026-08-10T12:00:00Z"),
    lines: [{ qty: 2, name: "Hamburguesa", modifiers: ["Extra bacon", "Sin cebolla"] }],
  });
  expect(html).toContain("42");
  expect(html).toContain("Cocina");
  expect(html).toContain("Hamburguesa");
  expect(html).toContain("Extra bacon");
  expect(html).not.toMatch(/€|\d+,\d{2}/);
});
