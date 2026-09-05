/**
 * Marca (white-label) — HELPERS PUROS y coherencia TS↔SQL (sub-1).
 *
 * La capa de branding de servidor (`@/lib/salon-branding/server`) valida colores y
 * construye la clave del logo con funciones PURAS de `@/lib/salon-branding/branding`.
 * Este archivo las ejercita en dos planos, como `salon-features` / `salon-branding-public`:
 *
 *   A) COMPORTAMIENTO — la validación de hex (mensaje legible ANTES del CHECK de la BD),
 *      el mapeo MIME→extensión y la convención de ruta `{salon_id}/logo.<ext>`.
 *   B) FUENTE — que las constantes TS son ESPEJO fiel de la verdad SQL de FASE 4A:
 *      la regex/`default` del color (`20260718110000_salon_branding.sql`) y el
 *      `file_size_limit` + `allowed_mime_types` del bucket
 *      (`20260718130000_storage_salon_logos.sql`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  ALLOWED_LOGO_MIME_TYPES,
  BrandingError,
  DEFAULT_PRIMARY_COLOR,
  HEX_COLOR_PATTERN,
  LOGO_MIME_EXTENSIONS,
  MAX_LOGO_BYTES,
  SALON_LOGOS_BUCKET,
  assertValidHexColor,
  buildLogoObjectPath,
  buildLogoSrc,
  isAllowedLogoMime,
  isValidHexColor,
  logoExtensionForMime,
  normalizeSecondaryColor,
  type AllowedLogoMime,
  type SalonBranding,
} from "@/lib/salon-branding/branding";

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO
// ─────────────────────────────────────────────────────────────────────────────
describe("assertValidHexColor — validación de hex antes del CHECK de la BD", () => {
  it("acepta #rrggbb en mayúsculas y minúsculas y devuelve el valor normalizado (trim)", () => {
    expect(assertValidHexColor("#ff0000")).toBe("#ff0000");
    expect(assertValidHexColor("#FF00AA")).toBe("#FF00AA");
    expect(assertValidHexColor("  #112233  ")).toBe("#112233");
  });

  it("rechaza atajo de 3 dígitos, alfa de 8, sin almohadilla, no-hex y vacío", () => {
    for (const bad of ["#fff", "#ff0000ff", "ff0000", "#12345g", "#1234", "", "   "]) {
      expect(() => assertValidHexColor(bad)).toThrow(BrandingError);
    }
  });

  it("el error es invalid_request/400 con un mensaje LEGIBLE (etiqueta personalizable)", () => {
    try {
      assertValidHexColor("nope", "El color principal");
      expect.unreachable("debería haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(BrandingError);
      const branding = error as BrandingError;
      expect(branding.code).toBe("invalid_request");
      expect(branding.status).toBe(400);
      expect(branding.message).toBe("El color principal debe estar en formato #RRGGBB");
    }
  });

  it("isValidHexColor refleja la misma regla sin lanzar", () => {
    expect(isValidHexColor("#abcdef")).toBe(true);
    expect(isValidHexColor("#abc")).toBe(false);
    expect(isValidHexColor(123)).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
  });
});

describe("normalizeSecondaryColor — undefined=no tocar, null/''=limpiar, hex=validar", () => {
  it("undefined ⇒ undefined (no se toca el acento)", () => {
    expect(normalizeSecondaryColor(undefined)).toBeUndefined();
  });

  it("null o cadena vacía ⇒ null (se limpia el acento)", () => {
    expect(normalizeSecondaryColor(null)).toBeNull();
    expect(normalizeSecondaryColor("")).toBeNull();
    expect(normalizeSecondaryColor("   ")).toBeNull();
  });

  it("un hex válido se normaliza; uno inválido lanza BrandingError", () => {
    expect(normalizeSecondaryColor("  #00FF00 ")).toBe("#00FF00");
    expect(() => normalizeSecondaryColor("verde")).toThrow(BrandingError);
  });
});

describe("logo — MIME admitidos, extensión y convención de ruta {salon_id}/logo.<ext>", () => {
  it("isAllowedLogoMime discrimina el catálogo del bucket", () => {
    expect(isAllowedLogoMime("image/png")).toBe(true);
    expect(isAllowedLogoMime("image/gif")).toBe(false);
    expect(isAllowedLogoMime("application/pdf")).toBe(false);
  });

  it("logoExtensionForMime mapea cada MIME admitido a su extensión canónica", () => {
    expect(logoExtensionForMime("image/png")).toBe("png");
    expect(logoExtensionForMime("image/jpeg")).toBe("jpg");
    expect(logoExtensionForMime("image/webp")).toBe("webp");
    expect(logoExtensionForMime("image/svg+xml")).toBe("svg");
    expect(logoExtensionForMime("image/avif")).toBe("avif");
  });

  it("buildLogoObjectPath usa el salon_id como PRIMER segmento: {salon_id}/logo.<ext>", () => {
    const salonId = "9f2c0000-0000-4000-8000-000000000001";
    expect(buildLogoObjectPath(salonId, "png")).toBe(`${salonId}/logo.png`);
    expect(buildLogoObjectPath(salonId, "webp")).toBe(`${salonId}/logo.webp`);
    // El primer segmento (lo que autoriza la política de Storage) es el salon_id.
    expect(buildLogoObjectPath(salonId, "png").split("/")[0]).toBe(salonId);
  });

  it("ALLOWED_LOGO_MIME_TYPES son exactamente las claves del catálogo", () => {
    expect([...ALLOWED_LOGO_MIME_TYPES].sort()).toEqual(
      Object.keys(LOGO_MIME_EXTENSIONS).sort(),
    );
    expect(ALLOWED_LOGO_MIME_TYPES).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) FUENTE — las constantes TS son espejo fiel de la migración real.
// ─────────────────────────────────────────────────────────────────────────────
describe("coherencia TS↔SQL — constantes de branding vs migraciones de FASE 4A", () => {
  const brandingSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718110000_salon_branding.sql"),
    "utf8",
  );
  const storageSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718130000_storage_salon_logos.sql"),
    "utf8",
  );

  it("HEX_COLOR_PATTERN es la MISMA regex que el CHECK de salon_branding", () => {
    expect(HEX_COLOR_PATTERN.source).toBe("^#[0-9a-fA-F]{6}$");
    expect(brandingSql).toContain(HEX_COLOR_PATTERN.source);
  });

  it("DEFAULT_PRIMARY_COLOR es el mismo default (#111827) de primary_color", () => {
    expect(DEFAULT_PRIMARY_COLOR).toBe("#111827");
    expect(brandingSql).toContain(`'${DEFAULT_PRIMARY_COLOR}'`);
  });

  it("SALON_LOGOS_BUCKET y MAX_LOGO_BYTES coinciden con el bucket (2 MiB)", () => {
    expect(SALON_LOGOS_BUCKET).toBe("salon-logos");
    expect(MAX_LOGO_BYTES).toBe(2_097_152);
    expect(storageSql).toContain("'salon-logos'");
    expect(storageSql).toContain(String(MAX_LOGO_BYTES));
  });

  it("cada MIME de LOGO_MIME_EXTENSIONS está en allowed_mime_types del bucket", () => {
    for (const mime of Object.keys(LOGO_MIME_EXTENSIONS) as AllowedLogoMime[]) {
      expect(storageSql).toContain(mime);
    }
  });

  it("la convención de ruta {salon_id}/logo.<ext> está documentada en la migración", () => {
    expect(storageSql).toContain("{salon_id}/logo.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLogoSrc — cache-busting del logo por `updated_at`
// ─────────────────────────────────────────────────────────────────────────────
describe("buildLogoSrc — la URL del logo lleva SIEMPRE versión (?v=updated_at)", () => {
  const LOGO_URL =
    "https://x.supabase.co/storage/v1/object/public/salon-logos/s1/logo.png";

  function branding(logo_url: string | null, updated_at: string): SalonBranding {
    return {
      salon_id: "s1",
      logo_url,
      primary_color: "#111827",
      secondary_color: null,
      created_at: "2026-01-01T00:00:00.000000+00:00",
      updated_at,
    } as SalonBranding;
  }

  it("devuelve null si no hay marca o no hay logo", () => {
    expect(buildLogoSrc(null)).toBeNull();
    expect(buildLogoSrc(branding(null, "2026-07-24T16:17:38.522987+00:00"))).toBeNull();
    expect(buildLogoSrc(branding("   ", "2026-07-24T16:17:38.522987+00:00"))).toBeNull();
  });

  it("añade ?v=updated_at (codificado) a la URL pública", () => {
    const src = buildLogoSrc(branding(LOGO_URL, "2026-07-24T16:17:38.522987+00:00"));
    expect(src).toBe(`${LOGO_URL}?v=${encodeURIComponent("2026-07-24T16:17:38.522987+00:00")}`);
  });

  it("misma URL + distinto updated_at ⇒ src DISTINTO (fuerza recarga tras reemplazar)", () => {
    const before = buildLogoSrc(branding(LOGO_URL, "2026-07-24T11:55:26.000000+00:00"));
    const after = buildLogoSrc(branding(LOGO_URL, "2026-07-24T16:17:38.522987+00:00"));
    expect(before).not.toBe(after);
  });
});
