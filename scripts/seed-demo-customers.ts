/**
 * seed-demo-customers.ts — Generador PURO y DETERMINISTA de fichas de cliente demo.
 * ---------------------------------------------------------------------------
 * Fábrica de datos ficticios (nombres españoles realistas + teléfonos + emails)
 * para el *seed* del salón demo (sub-5). Hermano de `seed-demo-data.ts` (catálogo
 * operativo): `scripts/seed-demo-salon.ts` lo consume para SEMBRAR clientes de
 * forma additiva e idempotente; los tests lo importan para verificar sus
 * invariantes SIN base de datos ni cliente Supabase.
 *
 * REGLA DE ORO: módulo **puro**, sin acceso a BD, sin `process`, sin Node APIs,
 * sin `Math.random()` ni `Date`. Por eso es:
 *
 *   · DETERMINISTA  — misma entrada ⇒ misma salida SIEMPRE (PRNG sembrado por
 *     índice). Requisito de la IDEMPOTENCIA del seed: al reejecutar, se regeneran
 *     exactamente los mismos clientes, el dedup por teléfono los reconoce y no se
 *     duplican fichas.
 *   · ESTABLE ANTE EL RECUENTO — la ficha del cliente `i` NO depende de `count`
 *     (cada cliente tiene su propio flujo PRNG sembrado con `i`). Así, subir el
 *     recuento de 120 a 150 conserva idénticas las 120 primeras y solo añade 30.
 *   · TESTEABLE — se importa tal cual desde los tests de Vitest (no arrastra el
 *     cliente Supabase ni el guard `require.main` del script de seed).
 *
 * GARANTÍAS DE UNICIDAD (las exige el esquema de `customers`):
 *   · Teléfono: cada ficha lleva su índice en los 4 últimos dígitos del número
 *     nacional (9 dígitos) ⇒ los `phone_e164` son únicos por construcción. Se
 *     emiten en FORMATOS VARIADOS (con/sin `+34`, `0034`, espacios, guiones,
 *     paréntesis, puntos) que TODOS normalizan al mismo E.164 vía
 *     `app.normalize_phone` — así se ejercita la normalización sin romper el
 *     índice único parcial `(salon_id, phone_e164)`.
 *   · Email: parte local desambiguada contra un `Set` global (estilo
 *     "maria.garcia", "maria.garcia2"…) ⇒ únicos (case-insensitive), respetando
 *     el índice único parcial `(salon_id, lower(email))`. Mezcla deliberada de
 *     fichas CON y SIN email.
 *
 * El resto (qr_token, cuenta de puntos `loyalty_accounts` y cupón de bienvenida
 * `welcome_coupons`) NO se fija aquí: lo generan el DEFAULT de la columna y el
 * trigger `trg_customers_bootstrap_loyalty` al INSERTAR cada ficha (ver
 * docs/seed-demo-contracts.md §5.1).
 */

// ───────────────────────────────────────────────────────────────────────────
// Tipos y parámetros de recuento.
// ───────────────────────────────────────────────────────────────────────────

/** Ficha demo lista para insertar en `public.customers` (campos escribibles). */
export interface DemoCustomerSeed {
  /** Nombre completo español: nombre de pila + dos apellidos. */
  fullName: string;
  /**
   * Teléfono en formato "crudo" VARIADO (así como lo teclearía una recepcionista).
   * Siempre NORMALIZABLE a un E.164 ÚNICO vía `app.normalize_phone` / `normalizePhone`.
   */
  phone: string;
  /** Email (mezcla con/sin): `null` en ~1/3 de las fichas; único si presente. */
  email: string | null;
  /** Fecha de nacimiento `YYYY-MM-DD` o `null` (no todas las fichas la tienen). */
  birthDate: string | null;
  /** Consentimiento de marketing (mezcla true/false). */
  marketingConsent: boolean;
  /** Nota interna ocasional o `null`. */
  notes: string | null;
}

/** Recuento por defecto de clientes demo (dentro del rango pedido 80–150). */
export const DEFAULT_DEMO_CUSTOMER_COUNT = 120;
/** Mínimo de clientes demo (petición del cliente: 80–150). */
export const MIN_DEMO_CUSTOMER_COUNT = 80;
/** Máximo de clientes demo (petición del cliente: 80–150). */
export const MAX_DEMO_CUSTOMER_COUNT = 150;

/**
 * Resuelve el recuento de clientes a sembrar desde un valor de entorno opcional
 * (`SEED_DEMO_CUSTOMER_COUNT`): parsea, cae al por defecto si no es un entero
 * válido y SATURA al rango pedido [80, 150]. Determinista y sin efectos.
 */
export function resolveCustomerCount(raw: string | undefined): number {
  const parsed = raw !== undefined ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  const value = Number.isFinite(parsed) ? parsed : DEFAULT_DEMO_CUSTOMER_COUNT;
  return Math.min(MAX_DEMO_CUSTOMER_COUNT, Math.max(MIN_DEMO_CUSTOMER_COUNT, value));
}

// ───────────────────────────────────────────────────────────────────────────
// PRNG determinista (mulberry32). NO usa Math.random (rompería la idempotencia).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generador congruencial mulberry32: rápido, determinista y suficiente para datos
 * ficticios (NO criptográfico). Devuelve un `() => number` en [0, 1).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla base fija del generador de clientes demo (estable entre ejecuciones). */
const BASE_SEED = 0x5a10c0de;

/** Elige un elemento de un catálogo NO vacío (seguro bajo noUncheckedIndexedAccess). */
function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.floor(rng() * items.length) % items.length;
  const value = items[index];
  if (value === undefined) {
    // Inalcanzable: los catálogos de este módulo son constantes no vacías.
    throw new Error("pick: catálogo vacío (no debería ocurrir).");
  }
  return value;
}

/** Entero en [min, max] (ambos inclusive) a partir del PRNG. */
function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Rellena por la izquierda con ceros hasta `width`. */
function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

// ───────────────────────────────────────────────────────────────────────────
// Catálogos de nombres españoles (comunes y realistas).
// ───────────────────────────────────────────────────────────────────────────

/** Nombres de pila femeninos comunes en España (incluye algunos compuestos). */
const FEMALE_FIRST_NAMES: readonly string[] = [
  "María", "Carmen", "Ana", "Laura", "Marta", "Lucía", "Sara", "Paula", "Elena",
  "Cristina", "Isabel", "Rosa", "Pilar", "Nuria", "Silvia", "Beatriz", "Raquel",
  "Patricia", "Andrea", "Claudia", "Alba", "Irene", "Sofía", "Julia", "Natalia",
  "Teresa", "Alicia", "Ángela", "Marina", "Rocío", "Clara", "Eva", "Inés",
  "Verónica", "Lorena", "Miriam", "Noelia", "Carla", "Amparo", "Montserrat",
  "María José", "María del Carmen", "Ana María", "Ana Belén",
];

/** Nombres de pila masculinos comunes en España (incluye algunos compuestos). */
const MALE_FIRST_NAMES: readonly string[] = [
  "Antonio", "José", "Manuel", "Francisco", "David", "Juan", "Javier", "Daniel",
  "Carlos", "Miguel", "Pablo", "Jorge", "Alberto", "Alejandro", "Sergio",
  "Fernando", "Luis", "Raúl", "Rubén", "Iván", "Óscar", "Adrián", "Diego",
  "Marcos", "Álvaro", "Ángel", "Ramón", "Andrés", "Víctor", "Gonzalo", "Rafael",
  "Roberto", "Pedro", "Jesús", "Enrique", "Guillermo", "Mario", "Hugo",
  "José Luis", "Juan Carlos", "Francisco Javier", "José Antonio", "Juan José",
];

/** Apellidos más frecuentes en España. */
const SURNAMES: readonly string[] = [
  "García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez",
  "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno",
  "Muñoz", "Álvarez", "Romero", "Alonso", "Gutiérrez", "Navarro", "Torres",
  "Domínguez", "Vázquez", "Ramos", "Gil", "Ramírez", "Serrano", "Blanco",
  "Molina", "Morales", "Suárez", "Ortega", "Delgado", "Castro", "Ortiz", "Rubio",
  "Marín", "Sanz", "Núñez", "Iglesias", "Medina", "Garrido", "Cortés", "Castillo",
  "Santos", "Lozano", "Guerrero", "Cano", "Prieto", "Méndez", "Cruz", "Herrera",
  "Peña", "Flores", "Cabrera", "Campos", "Vega", "Fuentes", "Carrasco",
];

/** Notas internas ocasionales (realistas para una peluquería). */
const NOTES: readonly string[] = [
  "Prefiere cita por la tarde",
  "Alérgica a tintes con amoniaco",
  "Cliente habitual desde hace años",
  "Llegó por recomendación",
  "Sensible en el cuero cabelludo",
  "Prefiere siempre el mismo profesional",
  "Suele llevarse producto para casa",
  "Avisar por WhatsApp el día antes",
  "No usar secador muy caliente",
  "Interesada en tratamientos de keratina",
];

/** Dominios de email frecuentes (gmail con más peso: aparece varias veces). */
const EMAIL_DOMAINS: readonly string[] = [
  "gmail.com", "gmail.com", "gmail.com", "hotmail.com", "hotmail.com",
  "outlook.es", "yahoo.es", "icloud.com", "telefonica.net",
];

// ───────────────────────────────────────────────────────────────────────────
// Helpers de derivación (teléfono, email).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Convierte un texto a un fragmento apto para email: quita tildes/diacríticos
 * (María → maria, Núñez → nunez, ñ → n), pasa a minúsculas y elimina todo lo que
 * no sea `[a-z0-9]` (espacios de nombres compuestos incluidos).
 */
function emailSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Formatea 9 dígitos nacionales en uno de varios ESTILOS de tecleo. Todos
 * normalizan al MISMO E.164 (`+34` + los 9 dígitos) — solo cambia la presentación
 * para ejercitar `app.normalize_phone`. NO altera los dígitos nacionales, así que
 * la unicidad del E.164 se conserva.
 */
function formatPhone(national: string, variant: number): string {
  const g3a = national.slice(0, 3);
  const g3b = national.slice(3, 6);
  const g3c = national.slice(6, 9);
  const p3 = national.slice(0, 3);
  const p2a = national.slice(3, 5);
  const p2b = national.slice(5, 7);
  const p2c = national.slice(7, 9);
  switch (variant) {
    case 0:
      return national; // nacional crudo: "634120042"
    case 1:
      return `${g3a} ${g3b} ${g3c}`; // "634 120 042"
    case 2:
      return `+34 ${g3a} ${g3b} ${g3c}`; // "+34 634 120 042"
    case 3:
      return `0034${national}`; // "0034634120042"
    case 4:
      return `(+34) ${p3}-${p2a}-${p2b}-${p2c}`; // "(+34) 634-12-00-42"
    default:
      return `${p3}.${p2a}.${p2b}.${p2c}`; // "634.12.00.42"
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Generador principal.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Genera `count` fichas de cliente demo deterministas. Cada ficha `i` usa su
 * propio flujo PRNG sembrado con `i`, de modo que su contenido es idéntico entre
 * ejecuciones e INDEPENDIENTE de `count` (clave para la idempotencia additiva del
 * seed). La desambiguación de emails recorre las fichas en orden de índice contra
 * un `Set` compartido, también determinista.
 *
 * @param count número de fichas (el llamador ya lo satura al rango pedido).
 */
export function generateDemoCustomers(count: number): DemoCustomerSeed[] {
  const usedEmailLocals = new Set<string>();
  const customers: DemoCustomerSeed[] = [];

  for (let i = 0; i < count; i += 1) {
    // Semilla propia por cliente ⇒ ficha estable e independiente del recuento.
    const seed = (BASE_SEED + Math.imul(i, 0x9e3779b1)) >>> 0;
    const rng = mulberry32(seed);

    // — Nombre: nombre de pila + dos apellidos (convención española) —
    const isFemale = rng() < 0.55; // ligero sesgo femenino (mix de clientela)
    const firstName = pick(rng, isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
    const surname1 = pick(rng, SURNAMES);
    let surname2 = pick(rng, SURNAMES);
    for (let guard = 0; surname2 === surname1 && guard < 6; guard += 1) {
      surname2 = pick(rng, SURNAMES); // evita "López López" (poco natural)
    }
    const fullName = `${firstName} ${surname1} ${surname2}`;

    // — Teléfono: 9 dígitos nacionales, ÍNDICE en los 4 últimos ⇒ E.164 único —
    const roll = rng();
    const prefix = roll < 0.45 ? "6" : roll < 0.85 ? "7" : "9"; // móvil 6/7, fijo 9
    const middle = pad(pickInt(rng, 0, 9999), 4);
    const tail = pad(i, 4); // clave de unicidad (i ≤ 150 ⇒ 4 dígitos sobran)
    const national = `${prefix}${middle}${tail}`; // 9 dígitos
    const phone = formatPhone(national, i % 6);

    // — Fecha de nacimiento: ~80 % la tienen (edad ~20–76) —
    let birthDate: string | null = null;
    if (rng() < 0.8) {
      const year = pickInt(rng, 1950, 2006);
      const month = pickInt(rng, 1, 12);
      const day = pickInt(rng, 1, 28); // 28: válido en cualquier mes
      birthDate = `${year}-${pad(month, 2)}-${pad(day, 2)}`;
    }

    // — Email: MEZCLA con/sin (~2/3 lo tienen); único y desambiguado —
    let email: string | null = null;
    if (rng() < 0.68) {
      const firstToken = firstName.split(" ")[0] ?? firstName;
      const style = pickInt(rng, 0, 3);
      let base: string;
      if (style === 0) {
        base = `${emailSlug(firstToken)}.${emailSlug(surname1)}`;
      } else if (style === 1) {
        base = `${emailSlug(firstToken)}.${emailSlug(surname1)}.${emailSlug(surname2)}`;
      } else if (style === 2) {
        base = `${emailSlug(firstToken).slice(0, 1)}${emailSlug(surname1)}`;
      } else {
        base = `${emailSlug(firstToken)}${pickInt(rng, 70, 99)}`;
      }
      // Desambiguación determinista contra el Set global (garantiza unicidad,
      // incluso frente a bases naturales con dígitos). Estilo real: name, name2…
      let local = base;
      for (let n = 2; usedEmailLocals.has(local); n += 1) {
        local = `${base}${n}`;
      }
      usedEmailLocals.add(local);
      email = `${local}@${pick(rng, EMAIL_DOMAINS)}`;
    }

    // — Consentimiento de marketing y nota ocasional —
    const marketingConsent = rng() < 0.6;
    const notes = rng() < 0.18 ? pick(rng, NOTES) : null;

    customers.push({ fullName, phone, email, birthDate, marketingConsent, notes });
  }

  return customers;
}
