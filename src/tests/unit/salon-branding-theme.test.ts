/**
 * Marca (white-label) — TEMATIZADO DINÁMICO del panel (sub-3). HELPERS PUROS.
 *
 * Ejercita `@/lib/salon-branding/theme`: la conversión hex→HSL, la derivación de tokens
 * de acento para tema claro/oscuro (con foreground elegido por CONTRASTE) y la
 * serialización a un `<style>` ACOTADO al subárbol del panel. Dos planos, como el resto
 * de la capa de marca:
 *
 *   A) COMPORTAMIENTO — conversión de color, elección de foreground legible, fallback
 *      limpio (`null`) y forma/seguridad del CSS emitido.
 *   B) COHERENCIA — que aplicar la marca con el PROPIO violeta del sistema reproduce
 *      los tokens premium por defecto (262 83% 58% → 262 83% 68% en oscuro), prueba de
 *      que el tematizado re-tinta sin reescribir la UI base.
 */
import { describe, it, expect } from "vitest";

import { DEFAULT_PRIMARY_COLOR } from "@/lib/salon-branding/branding";
import {
  BRAND_SCOPE_ATTR,
  buildBrandThemeCss,
  hexToHsl,
  resolveBrandTheme,
} from "@/lib/salon-branding/theme";
import type { SalonBranding } from "@/types/database";

/** Fila de marca sintética; `overrides` ajusta lo que cada test necesita. */
function branding(overrides: Partial<SalonBranding> = {}): SalonBranding {
  return {
    salon_id: "00000000-0000-0000-0000-000000000000",
    logo_url: null,
    primary_color: "#7c3aed",
    secondary_color: null,
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO — conversión de color
// ─────────────────────────────────────────────────────────────────────────────
describe("hexToHsl — #rrggbb → HSL entero (formato del sistema de diseño)", () => {
  it("convierte los colores canónicos con canales redondeados", () => {
    expect(hexToHsl("#7c3aed")).toEqual({ h: 262, s: 83, l: 58 }); // violeta base
    expect(hexToHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 });
    expect(hexToHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("tolera espacios (trim) y es insensible a mayúsculas", () => {
    expect(hexToHsl("  #FF0000  ")).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("devuelve null ante un hex inválido (misma regex que el CHECK de la BD)", () => {
    for (const bad of ["#fff", "#ff0000ff", "red", "ff0000", "", "   ", "#12345g"]) {
      expect(hexToHsl(bad)).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO — derivación de tema
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveBrandTheme — fallback limpio al tema por defecto", () => {
  it("sin fila de marca ⇒ null (no se inyecta nada; manda el default)", () => {
    expect(resolveBrandTheme(null)).toBeNull();
  });

  it("color primario inválido ⇒ null (defensivo, aunque la BD ya lo valida)", () => {
    expect(resolveBrandTheme(branding({ primary_color: "#nothex" }))).toBeNull();
  });
});

describe("resolveBrandTheme — el primario tiñe los acentos en ambos modos", () => {
  it("expone los tokens de acento que la UI premium consume", () => {
    const theme = resolveBrandTheme(branding({ primary_color: "#111827" }));
    expect(theme).not.toBeNull();
    const keys = ["--primary", "--primary-foreground", "--ring", "--info", "--accent"];
    for (const key of keys) {
      expect(theme?.light).toHaveProperty(key);
      expect(theme?.dark).toHaveProperty(key);
    }
    // El anillo de foco sigue al primario (coherencia del sistema).
    expect(theme?.light["--ring"]).toBe(theme?.light["--primary"]);
  });

  it("en claro respeta el color de marca; en oscuro lo aclara (>= 56% L)", () => {
    // #111827 (L 11%) es casi negro: usable como botón en claro, invisible en oscuro
    // salvo que se aclare. El primario oscuro sube a 56% (mínimo del clamp).
    const theme = resolveBrandTheme(branding({ primary_color: "#111827" }));
    expect(theme?.light["--primary"]).toBe("221 39% 11%");
    expect(theme?.dark["--primary"]).toBe("221 39% 56%");
  });
});

describe("resolveBrandTheme — foreground elegido por CONTRASTE (no siempre blanco)", () => {
  it("marca clara (amarillo) ⇒ texto OSCURO en claro", () => {
    const theme = resolveBrandTheme(branding({ primary_color: "#facc15" }));
    expect(theme?.light["--primary-foreground"]).toBe("30 10% 15%");
  });

  it("marca oscura (casi negra) ⇒ texto CLARO en claro", () => {
    const theme = resolveBrandTheme(branding({ primary_color: "#111827" }));
    expect(theme?.light["--primary-foreground"]).toBe("40 40% 99%");
  });
});

describe("resolveBrandTheme — el acento sutil toma el matiz del color secundario", () => {
  it("con secundario, el lavado del acento cambia de matiz (hover/estado activo)", () => {
    const withSecondary = resolveBrandTheme(
      branding({ primary_color: "#111827", secondary_color: "#22d3ee" }),
    );
    const withoutSecondary = resolveBrandTheme(
      branding({ primary_color: "#111827", secondary_color: null }),
    );
    // Cian (#22d3ee ~ matiz 188) tiñe el acento; sin él, hereda el matiz del primario (221).
    expect(withSecondary?.light["--accent"]).toMatch(/^188 /);
    expect(withoutSecondary?.light["--accent"]).toMatch(/^221 /);
    // Estructura de lavado claro / tinte profundo intacta (L alta en claro, baja en oscuro).
    expect(withSecondary?.light["--accent"]).toMatch(/ 96%$/);
    expect(withSecondary?.dark["--accent"]).toMatch(/ 22%$/);
  });

  it("un secundario inválido se ignora y el acento cae al matiz del primario", () => {
    const theme = resolveBrandTheme(
      branding({ primary_color: "#111827", secondary_color: "#nope" }),
    );
    expect(theme?.light["--accent"]).toMatch(/^221 /);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO — serialización a CSS
// ─────────────────────────────────────────────────────────────────────────────
describe("buildBrandThemeCss — reglas acotadas al subárbol del panel y seguras", () => {
  const css = buildBrandThemeCss(
    resolveBrandTheme(branding({ primary_color: "#111827" }))!,
  );

  it("acota a [data-salon-brand] con la especificidad claro/oscuro esperada", () => {
    expect(css).toContain(":root [data-salon-brand]{");
    expect(css).toContain(":root.dark [data-salon-brand]{");
    expect(css).toContain("--primary:221 39% 11%");
    expect(css).toContain("--primary:221 39% 56%");
  });

  it("el atributo de acotado es una sola fuente de verdad", () => {
    expect(BRAND_SCOPE_ATTR).toBe("data-salon-brand");
    expect(css).toContain(`[${BRAND_SCOPE_ATTR}]`);
  });

  it("no contiene caracteres de inyección (solo tripletes numéricos)", () => {
    // Nada de HTML ni cierres de etiqueta: seguro para dangerouslySetInnerHTML.
    expect(css).not.toMatch(/[<>]/);
    expect(css).not.toContain("</style");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) COHERENCIA — la marca con el propio violeta reproduce el tema premium
// ─────────────────────────────────────────────────────────────────────────────
describe("coherencia — tematizar con el violeta del sistema no reescribe la UI", () => {
  it("#7c3aed reproduce el primario base (claro 58% L, oscuro +10 → 68% L)", () => {
    const theme = resolveBrandTheme(branding({ primary_color: "#7c3aed" }));
    expect(theme?.light["--primary"]).toBe("262 83% 58%");
    expect(theme?.dark["--primary"]).toBe("262 83% 68%");
  });

  it("el DEFAULT_PRIMARY_COLOR de la BD produce un tema válido (no rompe)", () => {
    const theme = resolveBrandTheme(branding({ primary_color: DEFAULT_PRIMARY_COLOR }));
    expect(theme).not.toBeNull();
    expect(theme?.light["--primary"]).toBe("221 39% 11%");
  });
});
