import { describe, it, expect } from "vitest";
import { aSlug, mapearCliente, mapearProyecto, mapearContrato } from "@/lib/migrar/mapeo";

describe("slug", () => {
  it("baja a minúsculas y sustituye espacios por guiones", () => {
    expect(aSlug("Dental Demo")).toBe("dental-demo");
  });
  it("quita acentos y eñes", () => {
    expect(aSlug("Clínica Odontología")).toBe("clinica-odontologia");
    expect(aSlug("Peluquería Ñandú")).toBe("peluqueria-nandu");
  });
  it("colapsa signos y guiones repetidos", () => {
    expect(aSlug("100  Montaditos!! (Móstoles)")).toBe("100-montaditos-mostoles");
  });
  it("no deja guiones al principio ni al final", () => {
    expect(aSlug("  —Hola—  ")).toBe("hola");
  });
});

describe("mapeo de cliente", () => {
  it("traduce el estado antiguo al nuevo", () => {
    expect(
      mapearCliente({ id: "1", name: "Demo", sector: "Dental", status: "active" })
    ).toEqual({ nombre: "Demo", slug: "demo", sector: "Dental", estado: "activo" });
  });
  it("un estado desconocido cae a «potencial», no revienta", () => {
    const r = mapearCliente({ id: "1", name: "Demo", sector: null, status: "raro" });
    expect(r?.estado).toBe("potencial");
  });
  it("descarta la fila sin nombre: un cliente sin nombre no es un cliente", () => {
    expect(
      mapearCliente({ id: "1", name: null, sector: null, status: "active" })
    ).toBeNull();
    expect(
      mapearCliente({ id: "1", name: "   ", sector: null, status: "active" })
    ).toBeNull();
  });
});

describe("mapeo de proyecto", () => {
  it("traduce la vertical antigua al tipo nuevo", () => {
    const casos: Array<[string, string]> = [
      ["voz", "voz"],
      ["chatbots", "chatbot"],
      ["webs-apps", "web-app"],
      ["automatizaciones", "automatizacion"],
      ["operaciones", "interno"],
    ];
    for (const [vertical, tipo] of casos) {
      const r = mapearProyecto({
        id: "1",
        client_id: null,
        name: "P",
        status: "active",
        pm_vertical: vertical,
        budget: null,
        start_date: null,
        end_date: null,
      });
      expect(r?.tipo, vertical).toBe(tipo);
    }
  });

  it("sin vertical cae a «interno»", () => {
    const r = mapearProyecto({
      id: "1",
      client_id: null,
      name: "P",
      status: "active",
      pm_vertical: null,
      budget: null,
      start_date: null,
      end_date: null,
    });
    expect(r?.tipo).toBe("interno");
  });

  it("traduce los seis estados antiguos", () => {
    const casos: Array<[string, string]> = [
      ["proposal", "desarrollo"],
      ["active", "produccion"],
      ["delivered", "mantenimiento"],
      ["invoiced", "mantenimiento"],
      ["paid", "mantenimiento"],
      ["cancelled", "retirado"],
    ];
    for (const [viejo, nuevo] of casos) {
      const r = mapearProyecto({
        id: "1",
        client_id: null,
        name: "P",
        status: viejo,
        pm_vertical: null,
        budget: null,
        start_date: null,
        end_date: null,
      });
      expect(r?.estado, viejo).toBe(nuevo);
    }
  });

  it("descarta el proyecto sin nombre", () => {
    expect(
      mapearProyecto({
        id: "1",
        client_id: null,
        name: "  ",
        status: "active",
        pm_vertical: null,
        budget: null,
        start_date: null,
        end_date: null,
      })
    ).toBeNull();
  });
});

describe("mapeo de contrato", () => {
  it("convierte presupuesto y fechas", () => {
    expect(
      mapearContrato({
        id: "1",
        client_id: "c",
        name: "P",
        status: "active",
        pm_vertical: "voz",
        budget: "290.00",
        start_date: "2026-05-01",
        end_date: null,
      })
    ).toEqual({ cuotaMensual: 290, alta: "2026-05-01", baja: null, estado: "activo" });
  });

  it("sin fecha de inicio no hay contrato: el alta es obligatoria", () => {
    expect(
      mapearContrato({
        id: "1",
        client_id: "c",
        name: "P",
        status: "active",
        pm_vertical: null,
        budget: "290.00",
        start_date: null,
        end_date: null,
      })
    ).toBeNull();
  });

  it("un proyecto cancelado da un contrato finalizado", () => {
    const r = mapearContrato({
      id: "1",
      client_id: "c",
      name: "P",
      status: "cancelled",
      pm_vertical: null,
      budget: null,
      start_date: "2026-01-01",
      end_date: "2026-03-01",
    });
    expect(r).toEqual({
      cuotaMensual: null,
      alta: "2026-01-01",
      baja: "2026-03-01",
      estado: "finalizado",
    });
  });

  it("descarta una baja anterior al alta en vez de romper la restricción", () => {
    const r = mapearContrato({
      id: "1",
      client_id: "c",
      name: "P",
      status: "active",
      pm_vertical: null,
      budget: null,
      start_date: "2026-05-01",
      end_date: "2026-01-01",
    });
    expect(r?.baja).toBeNull();
  });

  // pg devuelve los `numeric` como string, y "" o basura darían NaN, que
  // PostgREST rechazaría a mitad de la migración.
  it("un presupuesto que no es un número viaja como null, no como NaN", () => {
    for (const budget of ["", "  ", "gratis"]) {
      const r = mapearContrato({
        id: "1",
        client_id: "c",
        name: "P",
        status: "active",
        pm_vertical: null,
        budget,
        start_date: "2026-05-01",
        end_date: null,
      });
      expect(r?.cuotaMensual, budget).toBeNull();
    }
  });
});
