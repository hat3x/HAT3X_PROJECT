import { describe, it, expect } from "vitest";
import { buildDashboardNavItems } from "@/components/dashboard-nav-items";

describe("buildDashboardNavItems — por sector", () => {
  it("peluqueria: 'Clientes' sin cambios", () => {
    const items = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "peluqueria" });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
    expect(items.some((i) => i.label === "Pacientes")).toBe(false);
  });
  it("odontologia: 'Clientes' → 'Pacientes'", () => {
    const items = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "odontologia" });
    expect(items.some((i) => i.label === "Pacientes")).toBe(true);
    expect(items.some((i) => i.label === "Clientes")).toBe(false);
  });
  it("odontologia: '/periodontograma' aparece justo después de '/odontograma'; en peluquería NO aparece", () => {
    const dental = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "odontologia" });
    expect(dental.some((i) => i.href === "/periodontograma")).toBe(true);
    const odontoIdx = dental.findIndex((i) => i.href === "/odontograma");
    const perioIdx = dental.findIndex((i) => i.href === "/periodontograma");
    expect(perioIdx).toBe(odontoIdx + 1);

    const peluqueria = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "peluqueria" });
    expect(peluqueria.some((i) => i.href === "/periodontograma")).toBe(false);
  });
  it("odontologia: '/ortodoncia' es el último item dental; '/planes' NO va en el rail", () => {
    const dental = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "odontologia" });
    // Planes y Expediente ya no viven en el rail: son pestañas de la ficha del
    // paciente (/customers/[id]?tab=planes|expediente).
    expect(dental.some((i) => i.href === "/planes")).toBe(false);
    // Ortodoncia sí sigue en el rail, justo tras Periodontograma.
    const perioIdx = dental.findIndex((i) => i.href === "/periodontograma");
    const ortoIdx = dental.findIndex((i) => i.href === "/ortodoncia");
    expect(ortoIdx).toBe(perioIdx + 1);

    const peluqueria = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "peluqueria" });
    expect(peluqueria.some((i) => i.href === "/planes")).toBe(false);
  });
  it("odontologia: '/expediente' NO va en el rail (es pestaña del paciente)", () => {
    const dental = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "odontologia" });
    expect(dental.some((i) => i.href === "/expediente")).toBe(false);

    const peluqueria = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "peluqueria" });
    expect(peluqueria.some((i) => i.href === "/expediente")).toBe(false);
  });
  it("restauracion: ya no es cascarón; item 'Carta' visible y sin 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true, sector: "restauracion" });
    expect(items.some((i) => i.label === "Próximamente")).toBe(false);
    expect(items.some((i) => i.href === "/proximamente")).toBe(false);
    expect(items.some((i) => i.href === "/carta")).toBe(true);
  });
  it("sin sector = peluqueria", () => {
    const items = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: true });
    expect(items.some((i) => i.label === "Clientes")).toBe(true);
  });
  it("incluye /ortodoncia para odontología y no para peluquería", () => {
    const dental = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: false, sector: "odontologia" });
    const hair = buildDashboardNavItems({ showSettings: true, showManagement: true, hasPos: false, sector: "peluqueria" });
    expect(dental.some((i) => i.href === "/ortodoncia")).toBe(true);
    expect(hair.some((i) => i.href === "/ortodoncia")).toBe(false);
  });
});
