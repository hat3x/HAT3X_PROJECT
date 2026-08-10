/**
 * Gating de las secciones del nav por ROL y add-on `pos` (sub-12).
 *
 * La composición vive en una función PURA (`buildDashboardNavItems`) para poder
 * fijar aquí, sin render, el criterio del gating:
 *   · Facturación es superficie de PAGO → se OCULTA sin `pos`.
 *   · La analítica de gestión NO depende de `pos` → permanece con el rol adecuado.
 *   · La operativa diaria (Caja incluida) no depende de `pos`.
 */
import { describe, expect, it } from "vitest";

import {
  ANALITICA_ITEM,
  ARQUEO_ITEM,
  FACTURACION_ITEM,
  PRIMARY_NAV_ITEMS,
  SETTINGS_ITEM,
  buildDashboardNavItems,
} from "@/components/dashboard-nav-items";

/** Proyecta a la lista de destinos (lo único que importa para el gating). */
function hrefs(items: readonly { href: string }[]): string[] {
  return items.map((item) => item.href);
}

describe("buildDashboardNavItems · gating por rol y `pos`", () => {
  it("sin gestión (staff): solo la operativa diaria; ni Analítica ni Facturación ni Ajustes", () => {
    const items = buildDashboardNavItems({ showSettings: false, hasPos: true });

    expect(hrefs(items)).toEqual(hrefs(PRIMARY_NAV_ITEMS));
    expect(hrefs(items)).not.toContain(ANALITICA_ITEM.href);
    expect(hrefs(items)).not.toContain(FACTURACION_ITEM.href);
    expect(hrefs(items)).not.toContain(SETTINGS_ITEM.href);
  });

  it("owner/manager con `pos`: Analítica, Facturación, Arqueo y Ajustes visibles", () => {
    const items = hrefs(buildDashboardNavItems({ showSettings: true, hasPos: true }));

    expect(items).toContain(ANALITICA_ITEM.href);
    expect(items).toContain(FACTURACION_ITEM.href);
    expect(items).toContain(ARQUEO_ITEM.href);
    expect(items).toContain(SETTINGS_ITEM.href);
  });

  it("owner/manager SIN `pos`: Facturación OCULTA; Analítica y Ajustes permanecen", () => {
    const items = hrefs(buildDashboardNavItems({ showSettings: true, hasPos: false }));

    expect(items).not.toContain(FACTURACION_ITEM.href);
    // La analítica de gestión (ocupación) no depende de `pos` → sigue visible.
    expect(items).toContain(ANALITICA_ITEM.href);
    expect(items).toContain(SETTINGS_ITEM.href);
  });

  it("la operativa diaria (Caja incluida) es idéntica con y sin `pos`", () => {
    const withPos = hrefs(buildDashboardNavItems({ showSettings: false, hasPos: true }));
    const withoutPos = hrefs(
      buildDashboardNavItems({ showSettings: false, hasPos: false }),
    );

    expect(withPos).toEqual(withoutPos);
    expect(withoutPos).toContain("/tpv");
    // Arqueo es materia de gestión (dinero): NO lo ve un staff, esté o no `pos`.
    expect(withoutPos).not.toContain("/arqueo");
  });

  it("Facturación se coloca entre Analítica y Ajustes (del «cómo va» al «papeleo»)", () => {
    const items = hrefs(buildDashboardNavItems({ showSettings: true, hasPos: true }));

    expect(items.indexOf(ANALITICA_ITEM.href)).toBeLessThan(
      items.indexOf(FACTURACION_ITEM.href),
    );
    expect(items.indexOf(FACTURACION_ITEM.href)).toBeLessThan(
      items.indexOf(SETTINGS_ITEM.href),
    );
  });

  it("Recordatorios (recall de revisión) es operativa diaria: visible para staff, justo tras Citas", () => {
    const items = hrefs(buildDashboardNavItems({ showSettings: false, hasPos: false }));

    expect(items).toContain("/recordatorios");
    expect(items.indexOf("/recordatorios")).toBe(items.indexOf("/appointments") + 1);
  });

  it("restauración: owner ve el item Carta y NO 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/carta");
    expect(hrefs).not.toContain("/proximamente");
  });
  it("restauración: staff (sin settings) no cae en 'Próximamente'", () => {
    const items = buildDashboardNavItems({ showSettings: false, hasPos: false, sector: "restauracion" });
    expect(items.map((i) => i.href)).not.toContain("/proximamente");
  });

  it("restauración: staff ve Mostrador pero NO Carta", () => {
    const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/mostrador");
    expect(hrefs).not.toContain("/carta");
  });
  it("restauración: owner ve Mostrador y Carta", () => {
    const items = buildDashboardNavItems({ showSettings: true, hasPos: true, sector: "restauracion" });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/mostrador");
    expect(hrefs).toContain("/carta");
  });

  it("restauración: staff ve Mostrador y Cocina, no Carta", () => {
    const items = buildDashboardNavItems({ showSettings: false, hasPos: true, sector: "restauracion" });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/mostrador");
    expect(hrefs).toContain("/cocina");
    expect(hrefs).not.toContain("/carta");
  });
});
