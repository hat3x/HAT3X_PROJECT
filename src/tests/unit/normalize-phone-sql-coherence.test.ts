/**
 * Coherencia TS ↔ SQL: `normalizePhone` (`@/lib/customers/normalize-phone`) DEBE
 * producir SIEMPRE el mismo resultado que la función SQL `app.normalize_phone(text)`
 * (supabase/migrations/20260717110000_customers_phone_e164.sql).
 *
 * ¿Por qué importa? En la BD, `app.normalize_phone(phone)` alimenta la columna
 * GENERADA `customers.phone_e164` y su índice ÚNICO PARCIAL `(salon_id, phone_e164)`.
 * La app usa el ESPEJO en TS para avisar de duplicados / mostrar la forma canónica
 * ANTES de escribir. Si TS y SQL divergieran, el dedup se rompe: la app creería que
 * un número es nuevo y el índice lo rechazaría al insertar (o al revés, dos formas
 * del mismo número pasarían el control de la app y colisionarían en la BD).
 *
 * Este archivo blinda esa coherencia en TRES capas complementarias:
 *
 *   A) CONTRATO — una batería de casos representativos (los ejemplos LITERALES de la
 *      migración + una rama por regla) con su forma canónica esperada. Fija el lado
 *      TS del contrato.
 *
 *   B) DIFERENCIAL — un PORT de la lógica SQL a JS, transliterado línea a línea del
 *      cuerpo PL/pgSQL, ejecutado sobre un amplio conjunto de entradas generadas y
 *      comparado byte a byte con `normalizePhone`. Caza cualquier divergencia futura
 *      del lado TS (si alguien tocara `normalizePhone` sin tocar la SQL).
 *
 *   C) FUENTE — lee la migración REAL y verifica que `app.normalize_phone` sigue
 *      codificando las mismas reglas (limpieza `[^0-9+]`, prioridad '+' sobre '00',
 *      recorte anclado `^00`, país por defecto '34', guarda `^[0-9]{6,15}$`, IMMUTABLE).
 *      Caza la divergencia del lado SQL (si alguien tocara la función sin tocar el TS).
 *
 * Juntas: el PORT es el puente que debe permanecer sincronizado con la SQL; (C)
 * garantiza que la SQL sigue encajando con el PORT y (B) que el TS sigue encajando
 * con el PORT. Cualquier deriva en cualquiera de los dos lados rompe un test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { normalizePhone } from "@/lib/customers/normalize-phone";

// ─────────────────────────────────────────────────────────────────────────────
// PORT de app.normalize_phone(text) — transliteración fiel del cuerpo PL/pgSQL.
//
// SQL (migración 20260717110000, función IMMUTABLE):
//   if phone is null then return null;
//   cleaned := regexp_replace(trim(phone), '[^0-9+]', '', 'g');
//   if    cleaned like '+%'  then digits := regexp_replace(cleaned, '\D', '', 'g');
//   elsif cleaned like '00%' then digits := regexp_replace(regexp_replace(cleaned, '\D','','g'), '^00', '');
//   else                          digits := '34' || regexp_replace(cleaned, '\D', '', 'g');
//   if digits !~ '^[0-9]{6,15}$' then return null;
//   return '+' || digits;
//
// Se deriva del TEXTO SQL, de forma independiente de `normalizePhone`, para servir de
// referencia neutral en la comparación diferencial. El `trim(phone)` de la SQL es
// redundante (el `[^0-9+]` global elimina después cualquier espacio), así que aquí
// basta la limpieza global — el `cleaned` resultante es idéntico.
// ─────────────────────────────────────────────────────────────────────────────
function sqlNormalizePhonePort(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) {
    return null;
  }
  const cleaned = String(phone).replace(/[^0-9+]/g, "");

  let digits: string;
  if (cleaned.startsWith("+")) {
    digits = cleaned.replace(/\D/g, "");
  } else if (cleaned.startsWith("00")) {
    digits = cleaned.replace(/\D/g, "").replace(/^00/, "");
  } else {
    digits = "34" + cleaned.replace(/\D/g, "");
  }

  if (!/^[0-9]{6,15}$/.test(digits)) {
    return null;
  }
  return `+${digits}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A) CONTRATO — casos representativos con su forma canónica (lado TS).
// ─────────────────────────────────────────────────────────────────────────────
describe("coherencia TS↔SQL — contrato de casos representativos", () => {
  // Las cuatro variantes LITERALES del comentario de la migración + '+' entre
  // paréntesis: cinco formatos, el mismo número, una sola forma canónica.
  it.each([
    ["nacional sin prefijo", "612345678", "+34612345678"],
    ["'+' internacional con espacios", "+34 612 34 56 78", "+34612345678"],
    ["acceso internacional '0034'", "0034 612 345 678", "+34612345678"],
    ["paréntesis/guiones (nacional)", "(612) 345-678", "+34612345678"],
    ["'+' entre paréntesis", "(+34) 612-345-678", "+34612345678"],
    ["país distinto: Francia +33", "+33 6 12 34 56 78", "+33612345678"],
    ["'00' con país distinto (Francia)", "0033612345678", "+33612345678"],
    ["ya canónico (idempotente)", "+34612345678", "+34612345678"],
  ])("%s: %j → %j (TS == contrato)", (_label, input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["vacío", ""],
    ["solo espacios", "   "],
    ["texto sin dígitos", "sin tel"],
    ["solo símbolos", "()---"],
    ["solo '+'", "+"],
    ["solo '00'", "00"],
    ["'+34' sin número", "+34"],
    ["por debajo del mínimo (5 dígitos)", "+12345"],
    ["por encima del máximo (16 dígitos)", "+1234567890123456"],
  ])("%s ⇒ null (TS == contrato)", (_label, input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) DIFERENCIAL — `normalizePhone` (TS) == `sqlNormalizePhonePort` (SQL) byte a byte.
// ─────────────────────────────────────────────────────────────────────────────
describe("coherencia TS↔SQL — igualdad diferencial contra el port de la SQL", () => {
  // Conjunto amplio y variado que ejercita TODAS las ramas y guardas: prefijos
  // ('+', '00', ninguno), separadores, longitudes límite (5/6/15/16 dígitos), el
  // orden '+' antes de '00', basura sin número real, letras, '+' repetidos, etc.
  const representative: Array<string | null | undefined> = [
    null,
    undefined,
    "",
    "   ",
    "\t\n ",
    "sin tel",
    "()",
    "---",
    "+",
    "00",
    "+34",
    "0034",
    "612345678",
    "912345678",
    "0612345678",
    "612 34 56 78",
    "612-345.678",
    "612/345/678",
    "(612) 345-678",
    "Tel: 612345678",
    "+34612345678",
    "+34 612 34 56 78",
    "(+34) 612-345-678",
    "+34+612345678",
    "+33 6 12 34 56 78",
    "0034612345678",
    "0033612345678",
    "000034612345", // solo se recorta el PRIMER '00'
    "+0034612345678", // '+' gana a '00': NO se recorta el '00'
    "+123456", // 6 dígitos: mínimo válido
    "+12345", // 5 dígitos: null
    "+123456789012345", // 15 dígitos: máximo válido
    "+1234567890123456", // 16 dígitos: null
    "1234567890123", // '34' + 13 = 15: válido
    "12345678901234", // '34' + 14 = 16: null
    "٦١٢٣٤٥٦٧٨", // dígitos árabo-índicos: no son [0-9] ASCII → se descartan
  ];

  // Genera además combinaciones prefijo × cuerpo × separadores para ampliar la
  // cobertura sin escribir cada caso a mano (fuzz determinista, sin aleatoriedad).
  const prefixes = ["", "+", "00", "+34", "0034", "0", "34"];
  const bodies = ["", "6", "61234", "612345", "612345678", "6123456789012345"];
  const separators = ["", " ", "-", " (x) ", "..."];
  const generated: string[] = [];
  for (const p of prefixes) {
    for (const body of bodies) {
      for (const sep of separators) {
        generated.push(`${p}${sep}${body}`);
      }
    }
  }

  const all = [...representative, ...generated];

  it("cada entrada normaliza IGUAL en TS y en el port de la SQL", () => {
    const divergences: Array<{ input: unknown; ts: string | null; sql: string | null }> = [];
    for (const input of all) {
      const ts = normalizePhone(input as string | null | undefined);
      const sql = sqlNormalizePhonePort(input);
      if (ts !== sql) {
        divergences.push({ input, ts, sql });
      }
    }
    // Un fallo enseña EXACTAMENTE qué entradas divergen (TS vs SQL), no un opaco false.
    expect(divergences).toEqual([]);
  });

  it("el port cubre de verdad las tres ramas y ambas guardas (no es un no-op)", () => {
    // Rama '+', rama '00', rama nacional, guarda inferior y superior: si el port
    // estuviera roto (p. ej. devolviera siempre null) estos anclajes lo delatarían.
    expect(sqlNormalizePhonePort("+33612345678")).toBe("+33612345678"); // rama '+'
    expect(sqlNormalizePhonePort("0034612345678")).toBe("+34612345678"); // rama '00'
    expect(sqlNormalizePhonePort("612345678")).toBe("+34612345678"); // rama nacional
    expect(sqlNormalizePhonePort("+12345")).toBeNull(); // guarda inferior
    expect(sqlNormalizePhonePort("+1234567890123456")).toBeNull(); // guarda superior
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C) FUENTE — la SQL real sigue codificando las mismas reglas que el TS/port.
// ─────────────────────────────────────────────────────────────────────────────
describe("coherencia TS↔SQL — anclajes semánticos en la migración real", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260717110000_customers_phone_e164.sql"),
    "utf8",
  );

  // Aísla el CUERPO de la función para que los anclajes se comprueben sobre la
  // definición, no sobre comentarios/ejemplos del encabezado.
  const fnBody = (() => {
    const start = migrationSql.indexOf("create or replace function app.normalize_phone");
    const end = migrationSql.indexOf("$$;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return migrationSql.slice(start, end);
  })();

  it("declara la función como IMMUTABLE (requisito de columna generada e índice)", () => {
    expect(fnBody.toLowerCase()).toContain("immutable");
  });

  it("paso 1: limpia con el mismo patrón [^0-9+] que el TS", () => {
    expect(fnBody).toContain("[^0-9+]");
  });

  it("prioridad de ramas: evalúa '+' ANTES que '00' (igual que el TS)", () => {
    const plusBranch = fnBody.indexOf("like '+%'");
    const zerosBranch = fnBody.indexOf("like '00%'");
    expect(plusBranch).toBeGreaterThan(-1);
    expect(zerosBranch).toBeGreaterThan(-1);
    expect(plusBranch).toBeLessThan(zerosBranch);
  });

  it("recorta un ÚNICO '00' de cabecera con ancla ^ (no global)", () => {
    expect(fnBody).toContain("'^00'");
  });

  it("país por defecto '34' en la rama nacional (España)", () => {
    // Si alguien cambiara el país por defecto en la SQL sin actualizar el TS, aquí falla.
    expect(fnBody).toMatch(/'34'\s*\|\|/);
  });

  it("guarda de longitud E.164 idéntica: ^[0-9]{6,15}$", () => {
    expect(fnBody).toContain("^[0-9]{6,15}$");
  });

  it("el índice único es PARCIAL y por (salon_id, phone_e164), no global", () => {
    // El dedup vive en (salon_id, phone_e164) where phone_e164 is not null: es lo que
    // hace que la coherencia de normalización importe (misma forma canónica = colisión).
    expect(migrationSql).toContain("idx_customers_salon_phone_e164");
    expect(migrationSql).toMatch(/on public\.customers \(salon_id, phone_e164\)/);
    expect(migrationSql).toMatch(/where phone_e164 is not null/);
  });
});
