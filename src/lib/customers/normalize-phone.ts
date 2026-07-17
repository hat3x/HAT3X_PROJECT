/**
 * normalizePhone — canonicaliza un teléfono a E.164 (país por defecto: España, +34).
 *
 * ESPEJO EXACTO, byte a byte, de la función SQL `app.normalize_phone(text)`
 * (supabase/migrations/20260717110000_customers_phone_e164.sql). En la BD esa
 * función alimenta la columna GENERADA `customers.phone_e164` y su índice ÚNICO
 * PARCIAL `(salon_id, phone_e164)`. Esta versión TS existe para VALIDAR/normalizar
 * el teléfono ANTES de escribir (avisar de un duplicado, mostrar la forma canónica
 * en el formulario, buscar "¿existe ya este número en este salón?") y DEBE producir
 * SIEMPRE el mismo resultado que la BD: si divergen, la app creería que un número es
 * nuevo y el índice lo rechazaría al insertar — o al revés, dos formas del mismo
 * número pasarían el control de la app y colisionarían en la BD.
 *
 * Reglas (idénticas al SQL, en el mismo orden):
 *   1. Se queda solo con dígitos y '+' (fuera espacios, guiones, puntos, paréntesis,
 *      letras). El '+' sobrevive aunque venga entre paréntesis: '(+34) 6…' → '+346…'.
 *   2. Prefijo internacional explícito ('+' o '00') ⇒ el número YA trae su código de
 *      país, se respeta. Sin prefijo ⇒ número NACIONAL español, se antepone 34.
 *   3. Un E.164 tiene 6–15 dígitos: si no queda un número real ⇒ null (nunca un
 *      '+34'/'+' fantasma que colisionaría en el índice único).
 *
 * Ejemplos (todos → '+34612345678'):
 *   '612345678' · '+34 612 34 56 78' · '0034612345678' · '(612) 345-678'
 * Entradas sin número real ('', '  ', 'sin tel', '()', '---', null, undefined) ⇒ null.
 *
 * NOTA: normalización pragmática, NO un validador E.164 completo (longitud por país,
 * móvil vs fijo, operador…). Solo garantiza una forma canónica estable y comparable
 * para el dedup, exactamente como la BD.
 */
import type { Customer } from "@/types/database";

/** Código de país por defecto cuando no hay prefijo internacional (España, +34). */
const DEFAULT_COUNTRY_CODE = "34";

/**
 * Acepta el mismo tipo que la columna origen `customers.phone` (`string | null`) y
 * además `undefined`, para poder normalizar directamente el valor de un formulario
 * o de un campo opcional antes de escribir en BD.
 */
type PhoneInput = Customer["phone"] | undefined;

export function normalizePhone(input: PhoneInput): string | null {
  // Espejo del `if phone is null then return null` del SQL (undefined ⇒ sin dato).
  if (input === null || input === undefined) {
    return null;
  }

  // 1) Fuera todo lo que no sea dígito o '+'. Absorbe el `trim(phone)` del SQL —los
  //    espacios de los extremos también caen aquí— y deja `cleaned ∈ [0-9+]*`.
  const cleaned = input.replace(/[^0-9+]/g, "");

  // 2) Código de país según el prefijo internacional. El ORDEN importa: '+' tiene
  //    prioridad sobre '00' (igual que el `if … elsif` del SQL), de modo que
  //    '+0034…' conserva sus dígitos y NO se le recorta el '00'. En este punto
  //    `cleaned` ya solo tiene [0-9+], así que `\D` solo elimina los '+'.
  let digits: string;
  if (cleaned.startsWith("+")) {
    // Ya trae código de país (E.164 con '+'): nos quedamos con sus dígitos.
    digits = cleaned.replace(/\D/g, "");
  } else if (cleaned.startsWith("00")) {
    // '00' == código de acceso internacional == '+': se quita UN solo '00' de
    //  cabecera (regex anclado a `^`, sin flag global) y el resto ya trae su país
    //  ('0034…' → '34…').
    digits = cleaned.replace(/\D/g, "").replace(/^00/, "");
  } else {
    // Número NACIONAL (sin prefijo internacional): anteponemos España (34).
    digits = DEFAULT_COUNTRY_CODE + cleaned.replace(/\D/g, "");
  }

  // 3) Guarda de cordura E.164: entre 6 y 15 dígitos. Si no queda un número real
  //    (vacío o basura) ⇒ null, para que 'sin tel', '()' o '---' NO se conviertan
  //    en un falso '+34' que colisionaría en el índice único.
  if (!/^[0-9]{6,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}
