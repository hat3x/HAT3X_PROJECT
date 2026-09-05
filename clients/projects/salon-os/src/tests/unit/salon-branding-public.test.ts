/**
 * Lectura PÚBLICA del branding por slug — SOLO campos seguros (sub-11, requisito 5).
 *
 * `public.get_salon_branding(p_slug)` (SQL, migración 20260718140000) es el ÚNICO
 * camino ANÓNIMO a datos que viven en la tabla `salons` (theming por subdominio antes
 * del login). Su contrato de seguridad: devuelve EXCLUSIVAMENTE campos de marca
 *   { name, slug, logo_url, primary_color, secondary_color }
 * y NUNCA datos fiscales / PII del emisor de facturas:
 *   tax_id · legal_name · fiscal_address · email · phone · address · settings.
 *
 * Dos planos, como `normalize-phone-sql-coherence`:
 *
 *   A) COMPORTAMIENTO — un PORT en JS del SELECT de la RPC (referencia neutral). Se
 *      alimenta con un salón cuyo registro CONTIENE datos sensibles (tax_id, email,
 *      phone…) y se comprueba que la salida NO los incluye: las claves del resultado
 *      son EXACTAMENTE las 5 seguras. También: filtra por `active`, normaliza el slug
 *      y —LEFT JOIN— pinta un salón sin branding con el color por defecto.
 *
 *   B) FUENTE — el candado ESTRUCTURAL de la migración real: el `returns table(...)`
 *      declara EXACTAMENTE esas 5 columnas (por tipo no puede devolver una sensible),
 *      el cuerpo no referencia ninguna columna fiscal/PII, el endurecimiento
 *      (SECURITY DEFINER + STABLE + search_path='') y el grant a anon; y que el
 *      guardián fija la lista de 5 columnas y veta políticas anon/public sobre
 *      salons/salon_branding (la tabla nunca se expone entera).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

// Contrato de columnas: las 5 seguras (marca) y las 7 prohibidas (fiscal/PII de salons).
const SAFE_KEYS = ["name", "slug", "logo_url", "primary_color", "secondary_color"] as const;
const SENSITIVE_KEYS = [
  "tax_id",
  "legal_name",
  "fiscal_address",
  "email",
  "phone",
  "address",
  "settings",
] as const;

type Row = Record<string, unknown>;
interface DB {
  salons: Row[];
  salon_branding?: Row[];
}

interface BrandingOut {
  name: unknown;
  slug: unknown;
  logo_url: unknown;
  primary_color: unknown;
  secondary_color: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// PORT del cuerpo SQL de get_salon_branding (transliteración fiel):
//   select s.name, s.slug, b.logo_url, coalesce(b.primary_color,'#111827'),
//          b.secondary_color
//   from salons s left join salon_branding b on b.salon_id = s.id
//   where s.slug = lower(btrim(p_slug)) and s.active;
// Proyecta SOLO las 5 columnas seguras — nunca lee las sensibles del registro salons.
// ─────────────────────────────────────────────────────────────────────────────
function getSalonBranding(db: DB, pSlug: string | null | undefined): BrandingOut[] {
  if (pSlug === null || pSlug === undefined) return [];
  const norm = String(pSlug).trim().toLowerCase(); // lower(btrim(...))
  const out: BrandingOut[] = [];
  for (const s of db.salons) {
    if (s.slug === norm && s.active === true) {
      const b = (db.salon_branding ?? []).find((x) => x.salon_id === s.id);
      out.push({
        name: s.name,
        slug: s.slug,
        logo_url: b?.logo_url ?? null,
        primary_color: b?.primary_color ?? "#111827", // coalesce(default)
        secondary_color: b?.secondary_color ?? null,
      });
    }
  }
  return out;
}

/** Salón con TODO el registro poblado, incluidos los campos fiscales/PII (señuelos). */
function salonWithSensitiveData(overrides: Row = {}): Row {
  return {
    id: "sal-1",
    name: "Peluquería Sol",
    slug: "peluqueria-sol",
    active: true,
    // ↓↓↓ datos sensibles que NUNCA deben salir por la RPC pública ↓↓↓
    tax_id: "B12345678",
    legal_name: "Peluquería Sol S.L.",
    fiscal_address: "Calle Ficticia 123, Madrid",
    email: "privado@example.test",
    phone: "+34999888777",
    address: "Dirección interna del salón",
    settings: { internal: true },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A) COMPORTAMIENTO — la salida es EXACTAMENTE los 5 campos seguros.
// ─────────────────────────────────────────────────────────────────────────────
describe("get_salon_branding (port) — solo campos seguros", () => {
  it("devuelve EXACTAMENTE {name, slug, logo_url, primary_color, secondary_color}", () => {
    const db: DB = {
      salons: [salonWithSensitiveData()],
      salon_branding: [
        { salon_id: "sal-1", logo_url: "/logo.png", primary_color: "#ff0000", secondary_color: "#00ff00" },
      ],
    };
    const [row] = getSalonBranding(db, "peluqueria-sol");
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual([...SAFE_KEYS].sort());
    expect(row).toEqual({
      name: "Peluquería Sol",
      slug: "peluqueria-sol",
      logo_url: "/logo.png",
      primary_color: "#ff0000",
      secondary_color: "#00ff00",
    });
  });

  it("NUNCA incluye tax_id / fiscal_address / email / phone (ni el resto de PII fiscal)", () => {
    const db: DB = { salons: [salonWithSensitiveData()] };
    const [row] = getSalonBranding(db, "peluqueria-sol");
    for (const key of SENSITIVE_KEYS) {
      expect(row).not.toHaveProperty(key);
    }
    // Y explícitamente los cuatro que nombra la subtarea.
    expect(row).not.toHaveProperty("tax_id");
    expect(row).not.toHaveProperty("fiscal_address");
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("phone");
    // Ninguno de los VALORES sensibles aparece serializado en la salida.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("B12345678"); // tax_id
    expect(serialized).not.toContain("privado@example.test"); // email
    expect(serialized).not.toContain("+34999888777"); // phone
    expect(serialized).not.toContain("Calle Ficticia"); // fiscal_address
  });

  it("usa el nombre COMERCIAL (salons.name), nunca la razón social (legal_name)", () => {
    const db: DB = {
      salons: [salonWithSensitiveData({ name: "Sol", legal_name: "RAZÓN SOCIAL SECRETA S.L." })],
    };
    const [row] = getSalonBranding(db, "peluqueria-sol");
    expect(row!.name).toBe("Sol");
    expect(JSON.stringify(row)).not.toContain("RAZÓN SOCIAL SECRETA");
  });

  it("un salón INACTIVO no filtra ni su marca ni su existencia (0 filas)", () => {
    const db: DB = { salons: [salonWithSensitiveData({ active: false })] };
    expect(getSalonBranding(db, "peluqueria-sol")).toEqual([]);
  });

  it("normaliza el slug de entrada (mayúsculas/espacios) antes de casar", () => {
    const db: DB = { salons: [salonWithSensitiveData()] };
    expect(getSalonBranding(db, "  PELUQUERIA-SOL  ")).toHaveLength(1);
  });

  it("LEFT JOIN: salón activo SIN branding se pinta con el color por defecto #111827", () => {
    const db: DB = { salons: [salonWithSensitiveData()] }; // sin fila en salon_branding
    const [row] = getSalonBranding(db, "peluqueria-sol");
    expect(row).toEqual({
      name: "Peluquería Sol",
      slug: "peluqueria-sol",
      logo_url: null,
      primary_color: "#111827",
      secondary_color: null,
    });
  });

  it("slug inexistente o nulo ⇒ 0 filas (sin error, no es un oráculo de enumeración)", () => {
    const db: DB = { salons: [salonWithSensitiveData()] };
    expect(getSalonBranding(db, "no-existe")).toEqual([]);
    expect(getSalonBranding(db, null)).toEqual([]);
    expect(getSalonBranding(db, undefined)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) FUENTE — el candado estructural de la migración real (anti-fuga por tipo).
// ─────────────────────────────────────────────────────────────────────────────
describe("get_salon_branding — candado estructural en la migración real", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260718140000_rpc_get_salon_branding.sql"),
    "utf8",
  );

  // Región de la función: de la firma al cierre `$$;` — excluye el encabezado y el
  // `comment on function`, que SÍ mencionan los campos sensibles ("NUNCA: tax_id…").
  const fnRegion = (() => {
    const start = migrationSql.indexOf("create or replace function public.get_salon_branding");
    const end = migrationSql.indexOf("$$;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return migrationSql.slice(start, end);
  })();

  it("el RETURNS TABLE declara EXACTAMENTE las 5 columnas seguras", () => {
    const block = fnRegion.slice(
      fnRegion.indexOf("returns table"),
      fnRegion.indexOf(")", fnRegion.indexOf("returns table")),
    );
    for (const col of SAFE_KEYS) {
      expect(block).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("el cuerpo de la función NO referencia ninguna columna fiscal/PII de salons", () => {
    // Candado central: si el SELECT o el RETURNS TABLE mencionaran una columna
    // sensible, esta comprobación (sobre la definición, no sobre comentarios) lo caza.
    for (const key of SENSITIVE_KEYS) {
      expect(fnRegion).not.toContain(key);
    }
  });

  it("endurecida: SECURITY DEFINER + STABLE + search_path='' y filtra por active", () => {
    expect(fnRegion.toLowerCase()).toContain("security definer");
    expect(fnRegion.toLowerCase()).toContain("stable");
    expect(fnRegion).toMatch(/set search_path\s*=\s*''/);
    expect(fnRegion).toMatch(/where s\.slug = lower\(btrim\(p_slug\)\)/);
    expect(fnRegion).toMatch(/and s\.active/);
  });

  it("EXECUTE reseteado de public y concedido a anon + authenticated (única RPC anon)", () => {
    expect(migrationSql).toMatch(/revoke all on function public\.get_salon_branding\(text\) from public/);
    expect(migrationSql).toMatch(
      /grant\s+execute on function public\.get_salon_branding\(text\) to anon, authenticated/,
    );
  });

  it("el guardián fija la lista de 5 columnas y veta salons/salon_branding a anon/public", () => {
    // La lista esperada del guardián (orden alfabético) es exactamente las 5 seguras.
    expect(migrationSql).toMatch(
      /array\['logo_url','name','primary_color','secondary_color','slug'\]/,
    );
    // Y aborta si salons o salon_branding tuvieran una política abierta a anon/public.
    expect(migrationSql).toMatch(/array\['salons', 'salon_branding'\]/);
    expect(migrationSql).toMatch(/anon.*public|anon\/public/);
  });
});
