import { describe, it, expect } from "vitest";
import { validarContrato, validarServicio } from "@/lib/db/acciones-proyecto";

const contratoBase = {
  clienteId: "11111111-1111-1111-1111-111111111111",
  proyectoId: "22222222-2222-2222-2222-222222222222",
  cuotaMensual: 290,
  addons: ["recepcionista-ia"],
  alta: "2026-05-01",
  baja: null,
  estado: "activo",
};

const servicioBase = {
  proyectoId: "22222222-2222-2222-2222-222222222222",
  clienteId: null,
  nombre: "Agente Retell",
  tipo: "agente-voz",
  proveedor: "retell",
};

describe("validación de contrato", () => {
  it("acepta un contrato correcto", async () => {
    expect((await validarContrato(contratoBase)).ok).toBe(true);
  });

  it("acepta cuota nula: hay proyectos sin cargo", async () => {
    expect((await validarContrato({ ...contratoBase, cuotaMensual: null })).ok).toBe(
      true
    );
  });

  it("rechaza una cuota negativa", async () => {
    const r = await validarContrato({ ...contratoBase, cuotaMensual: -10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cuota/i);
  });

  it("exige formato ISO AAAA-MM-DD en las fechas", async () => {
    for (const alta of ["01/05/2026", "2026-5-1", "hoy", "2026-13-01", "2026-02-31"]) {
      const r = await validarContrato({ ...contratoBase, alta });
      expect(r.ok, `debería rechazar «${alta}»`).toBe(false);
    }
  });

  it("exige el mismo formato en la baja", async () => {
    const r = await validarContrato({ ...contratoBase, baja: "01/06/2026" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baja/i);
  });

  it("rechaza una baja anterior al alta", async () => {
    const r = await validarContrato({ ...contratoBase, baja: "2026-04-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/baja/i);
  });

  it("acepta una baja igual al alta", async () => {
    expect((await validarContrato({ ...contratoBase, baja: "2026-05-01" })).ok).toBe(
      true
    );
  });

  it("acepta los tres estados del esquema y rechaza cualquier otro", async () => {
    for (const estado of ["activo", "pausado", "finalizado"]) {
      expect((await validarContrato({ ...contratoBase, estado })).ok, estado).toBe(true);
    }
    const r = await validarContrato({ ...contratoBase, estado: "moroso" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/estado/i);
  });
});

describe("validación de servicio", () => {
  it("acepta un servicio sin cliente: es del proyecto", async () => {
    expect((await validarServicio(servicioBase)).ok).toBe(true);
  });

  it("rechaza el nombre vacío", async () => {
    const r = await validarServicio({ ...servicioBase, nombre: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nombre/i);
  });

  it("rechaza un tipo que no exista en el esquema", async () => {
    const r = await validarServicio({ ...servicioBase, tipo: "inventado" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tipo/i);
  });

  it("acepta los diez tipos del esquema", async () => {
    const tipos = [
      "web", "api", "webhook", "workflow", "agente-voz",
      "telefonia", "base-datos", "cron", "dominio", "otro",
    ];
    for (const tipo of tipos) {
      expect((await validarServicio({ ...servicioBase, tipo })).ok, tipo).toBe(true);
    }
  });
});
