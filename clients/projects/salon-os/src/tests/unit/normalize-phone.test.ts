/**
 * Tests unitarios de `normalizePhone` (`@/lib/customers/normalize-phone`).
 *
 * `normalizePhone` es el ESPEJO en TS de la función SQL `app.normalize_phone(text)`
 * (supabase/migrations/20260717110000_customers_phone_e164.sql), que alimenta la
 * columna generada `customers.phone_e164` y su índice único parcial. La app la usa
 * para validar/normalizar el teléfono ANTES de escribir en BD, así que la exigencia
 * es COHERENCIA BYTE A BYTE con la BD: cada caso de abajo replica una rama o guarda
 * de la función SQL. Si la TS y la SQL divergieran, el dedup por teléfono se rompe
 * (duplicados que la app deja pasar y el índice rechaza, o al revés).
 */
import { describe, it, expect } from "vitest";

import { normalizePhone } from "@/lib/customers/normalize-phone";

describe("normalizePhone — casos canónicos del contrato (todos → '+34612345678')", () => {
  // Estos cuatro están escritos LITERALMENTE en el enunciado y en el comentario
  // de la migración: cuatro formatos, el mismo número, una sola forma canónica.
  it.each([
    ["nacional sin prefijo", "612345678"],
    ["internacional con '+' y espacios", "+34 612 34 56 78"],
    ["prefijo de acceso '0034' con espacios", "0034 612 345 678"],
    ["paréntesis y guiones (nacional)", "(612) 345-678"],
    ["'+' entre paréntesis: '(+34) 612-345-678'", "(+34) 612-345-678"],
  ])("%s: %j → '+34612345678'", (_label, input) => {
    expect(normalizePhone(input)).toBe("+34612345678");
  });
});

describe("normalizePhone — entradas sin número real ⇒ null (nunca un '+34' fantasma)", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["tabuladores y saltos de línea", "\t\n "],
    ["texto sin dígitos", "sin tel"],
    ["solo paréntesis", "()"],
    ["solo guiones", "---"],
    ["solo un '+'", "+"],
    ["solo '00'", "00"],
    ["'+34' sin número (2 dígitos)", "+34"],
    ["'0034' sin número (queda '34', 2 dígitos)", "0034"],
  ])("%s ⇒ null", (_label, input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("normalizePhone — rama NACIONAL (sin prefijo internacional): antepone 34", () => {
  it("un número nacional español recibe el prefijo 34", () => {
    expect(normalizePhone("612345678")).toBe("+34612345678");
  });

  it("un fijo nacional también (no distingue móvil/fijo: normalización pragmática)", () => {
    expect(normalizePhone("912345678")).toBe("+34912345678");
  });

  it("preserva los ceros nacionales tras el 34 (no valida operador)", () => {
    // '0612345678' → '34' + '0612345678' = '340612345678' (12 dígitos, válido).
    expect(normalizePhone("0612345678")).toBe("+340612345678");
  });
});

describe("normalizePhone — rama '+' (E.164 explícito): respeta el código de país", () => {
  it("respeta un país distinto de España (Francia +33)", () => {
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("colapsa varios '+' (todos los '+' se eliminan al extraer dígitos)", () => {
    // '\D' elimina TODOS los '+', no solo el de cabecera.
    expect(normalizePhone("+34+612345678")).toBe("+34612345678");
  });

  it("es idempotente sobre una entrada ya canónica", () => {
    expect(normalizePhone("+34612345678")).toBe("+34612345678");
    expect(normalizePhone(normalizePhone("612 345 678"))).toBe("+34612345678");
  });
});

describe("normalizePhone — rama '00' (código de acceso internacional)", () => {
  it("'00' equivale a '+': lo quita y respeta el país que sigue", () => {
    expect(normalizePhone("0034612345678")).toBe("+34612345678");
    expect(normalizePhone("0033612345678")).toBe("+33612345678");
  });

  it("solo recorta UN '00' de cabecera (anclado, no global)", () => {
    // '000034…' → dígitos '000034…' → quita solo el primer '00' → '0034…'.
    expect(normalizePhone("00" + "0034612345")).toBe("+0034612345");
  });
});

describe("normalizePhone — el ORDEN de ramas: '+' tiene prioridad sobre '00'", () => {
  it("'+0034…' NO recorta el '00' (entra por la rama '+', no por la '00')", () => {
    // Si '00' se evaluara primero, saldría '+34…'. La SQL evalúa '+' primero.
    expect(normalizePhone("+0034612345678")).toBe("+0034612345678");
  });
});

describe("normalizePhone — guarda de longitud E.164 (6–15 dígitos)", () => {
  it("6 dígitos es el mínimo válido", () => {
    expect(normalizePhone("+123456")).toBe("+123456"); // exactamente 6
  });

  it("5 dígitos ⇒ null (por debajo del mínimo)", () => {
    expect(normalizePhone("+12345")).toBeNull();
  });

  it("15 dígitos es el máximo válido", () => {
    expect(normalizePhone("+123456789012345")).toBe("+123456789012345"); // 15
  });

  it("16 dígitos ⇒ null (por encima del máximo E.164)", () => {
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });

  it("el prefijo '34' de la rama nacional cuenta para el límite", () => {
    // '34' + 13 dígitos = 15 (válido); '34' + 14 = 16 (null).
    expect(normalizePhone("1234567890123")).toBe("+341234567890123");
    expect(normalizePhone("12345678901234")).toBeNull();
  });
});

describe("normalizePhone — limpieza de caracteres (paso 1: solo [0-9+])", () => {
  it("elimina espacios, guiones, puntos, paréntesis y barras", () => {
    expect(normalizePhone("612-345.678")).toBe("+34612345678");
    expect(normalizePhone(" 6 1 2 3 4 5 6 7 8 ")).toBe("+34612345678");
    expect(normalizePhone("612/345/678")).toBe("+34612345678");
  });

  it("elimina letras entremezcladas con dígitos (se queda con los dígitos)", () => {
    expect(normalizePhone("Tel: 612345678")).toBe("+34612345678");
  });

  it("los dígitos no ASCII (p. ej. árabo-índicos) se descartan como en la BD", () => {
    // La SQL usa [0-9] ASCII en el paso 1; '٦١٢…' no son [0-9] → se van → '34' → null.
    expect(normalizePhone("٦١٢٣٤٥٦٧٨")).toBeNull();
  });
});
