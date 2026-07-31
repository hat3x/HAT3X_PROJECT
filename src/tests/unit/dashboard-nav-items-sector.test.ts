import { describe, it, expect } from "vitest";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";

describe("buildDashboardNavItems — por sector", () => {
  it("peluqueria: 'Clientes' sin cambios", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
    expect(items.some((i) => i.label === "Pacientes")).toBe(false);
  });
  it("odontologia: 'Clientes' → 'Pacientes'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(items.some((i) => i.label === "Pacientes")).toBe(true);
    expect(items.some((i) => i.label === "Clientes")).toBe(false);
  });
  it("restauracion (cascaron): item 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    expect(items.some((i) => i.label === "Próximamente")).toBe(true);
    expect(items.some((i) => i.href === "/proximamente")).toBe(true);
  });
  it("sin sector = peluqueria", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
  });
});
