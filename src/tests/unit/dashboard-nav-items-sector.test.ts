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
  it("odontologia: '/periodontograma' aparece justo después de '/odontograma'; en peluquería NO aparece", () => {
    const dental = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(dental.some((i) => i.href === "/periodontograma")).toBe(true);
    const odontoIdx = dental.findIndex((i) => i.href === "/odontograma");
    const perioIdx = dental.findIndex((i) => i.href === "/periodontograma");
    expect(perioIdx).toBe(odontoIdx + 1);

    const peluqueria = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(peluqueria.some((i) => i.href === "/periodontograma")).toBe(false);
  });
  it("odontologia: '/planes' aparece justo después de '/periodontograma'; en peluquería NO aparece", () => {
    const dental = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "odontologia" });
    expect(dental.some((i) => i.href === "/planes")).toBe(true);
    const perioIdx = dental.findIndex((i) => i.href === "/periodontograma");
    const planesIdx = dental.findIndex((i) => i.href === "/planes");
    expect(planesIdx).toBe(perioIdx + 1);

    const peluqueria = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "peluqueria" });
    expect(peluqueria.some((i) => i.href === "/planes")).toBe(false);
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
