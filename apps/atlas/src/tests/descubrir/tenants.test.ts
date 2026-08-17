import { describe, it, expect } from "vitest";
import {
  reconciliar,
  esDemo,
  type TenantRemoto,
  type ServicioLocal,
} from "@/lib/descubrir/tenants";

const remoto = (slug: string, sector = "peluqueria"): TenantRemoto => ({
  slug,
  nombre: `Salón ${slug}`,
  sector,
});

const local = (slug: string, activo = true): ServicioLocal => ({
  id: `id-${slug}`,
  slug,
  activo,
});

describe("reconciliar", () => {
  it("da de alta lo que está fuera y no dentro", () => {
    const plan = reconciliar([remoto("uno"), remoto("dos")], [local("uno")]);

    expect(plan.alta.map((t) => t.slug)).toEqual(["dos"]);
    expect(plan.pausar).toEqual([]);
    expect(plan.reactivar).toEqual([]);
  });

  // La razón de ser de todo esto: por HTTP, un cliente dado de baja y uno caído
  // son el mismo 404. Solo el censo distingue uno de otro.
  it("pausa lo que ya no está en el censo, en vez de dejarlo alertando", () => {
    const plan = reconciliar([remoto("uno")], [local("uno"), local("dos")]);

    expect(plan.pausar.map((s) => s.slug)).toEqual(["dos"]);
    expect(plan.alta).toEqual([]);
  });

  it("reactiva al que vuelve", () => {
    const plan = reconciliar([remoto("uno")], [local("uno", false)]);

    expect(plan.reactivar.map((s) => s.slug)).toEqual(["uno"]);
    expect(plan.alta).toEqual([]);
    expect(plan.pausar).toEqual([]);
  });

  it("no toca lo que ya está bien", () => {
    const plan = reconciliar([remoto("uno")], [local("uno")]);
    expect(plan).toEqual({ alta: [], pausar: [], reactivar: [] });
  });

  it("deja en paz lo que ya estaba pausado y sigue fuera", () => {
    const plan = reconciliar([remoto("uno")], [local("uno"), local("viejo", false)]);
    expect(plan.pausar).toEqual([]);
    expect(plan.reactivar).toEqual([]);
  });

  it("aguanta los tres movimientos a la vez", () => {
    const plan = reconciliar(
      [remoto("sigue"), remoto("nuevo"), remoto("vuelve")],
      [local("sigue"), local("se-va"), local("vuelve", false)]
    );

    expect(plan.alta.map((t) => t.slug)).toEqual(["nuevo"]);
    expect(plan.pausar.map((s) => s.slug)).toEqual(["se-va"]);
    expect(plan.reactivar.map((s) => s.slug)).toEqual(["vuelve"]);
  });

  // Un censo vacío casi siempre significa que la llamada falló, no que HAT3X se
  // haya quedado sin clientes. Pausarlo todo dejaría a Atlas ciego justo cuando
  // algo va mal, que es cuando más falta hace.
  it("con el censo vacío no pausa nada: eso huele a fallo, no a que no queden clientes", () => {
    const plan = reconciliar([], [local("uno"), local("dos")]);
    expect(plan.pausar).toEqual([]);
    expect(plan.alta).toEqual([]);
  });

  it("sin nada dado de alta todavía, da de alta el censo entero", () => {
    const plan = reconciliar([remoto("uno"), remoto("dos")], []);
    expect(plan.alta.map((t) => t.slug)).toEqual(["uno", "dos"]);
  });
});

describe("esDemo", () => {
  it.each(["demo", "demo-dental", "demo-resto"])("%s es una demo", (slug) => {
    expect(esDemo(slug)).toBe(true);
  });

  // «demo» entero o seguido de separador. Un cliente real llamado «demolición»
  // no puede quedarse sin avisos por un prefijo mal comparado.
  it.each(["denueveanueve", "biodental", "demolicion-sa", "midemo"])(
    "%s NO es una demo",
    (slug) => {
      expect(esDemo(slug)).toBe(false);
    }
  );
});
