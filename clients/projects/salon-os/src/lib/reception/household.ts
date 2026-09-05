/**
 * Un teléfono identifica a una FAMILIA, no a una persona.
 *
 * ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
 * Kairos exigía "un teléfono = una ficha" para evitar duplicados. En una
 * clínica eso es falso: la madre da su móvil para ella y para sus hijos, y cada
 * uno tiene su ficha, su odontograma y sus tratamientos. La restricción dejaba
 * a 397 de las 1.200 fichas de Biodental sin teléfono — y por tanto sin
 * recordatorios de cita.
 *
 * Al permitir el número repetido aparece una pregunta que antes no existía:
 * cuando llama ese teléfono, ¿quién llama? Esto la responde.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 * Ante la duda, PREGUNTAR. Reservarle una cita a la madre cuando llamaba el
 * hijo no es un fallo que se vea: se ve el día que uno de los dos se presenta y
 * el otro no. Por eso, cuando el nombre no desempata, este módulo devuelve los
 * candidatos en vez de elegir — y quien llame (Sara, o la pantalla) pregunta,
 * que es exactamente lo que hace una recepcionista humana.
 */

/** Una ficha que comparte el teléfono con la que se busca. */
export interface HouseholdCandidate {
  id: string;
  fullName: string;
}

export type HouseholdMatch =
  /** Nadie con ese teléfono. */
  | { kind: "none" }
  /** Resuelto sin ambigüedad. */
  | { kind: "one"; customerId: string }
  /** Varios posibles: hay que preguntar cuál. */
  | { kind: "ambiguous"; candidates: HouseholdCandidate[] };

/**
 * Normaliza un nombre para compararlo con lo que se transcribe de una llamada.
 *
 * Sara escribe lo que oye, así que "LUCIA CASTIELLA ANTON" y "Lucía Castiella
 * Antón" son la misma persona. Se quitan tildes y mayúsculas y se colapsan los
 * espacios; tratarlas como distintas duplicaría fichas.
 */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    // Marcas diacríticas: quita la tilde y deja la letra.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `true` si el nombre dicho se corresponde con el de la ficha.
 *
 * Vale el nombre completo y vale solo el de pila: por teléfono la gente dice
 * "soy Santiago", no su nombre registral. Se compara por PALABRAS ENTERAS y
 * empezando por el principio, no por subcadena: "Ana" no puede casar con
 * "Mariana", y "Ruiz" —un apellido— no identifica a nadie dentro de una familia
 * que lo comparte entero.
 */
function nameMatches(said: string, onFile: string): boolean {
  const dichas = normalizeName(said).split(" ").filter(Boolean);
  const fichadas = normalizeName(onFile).split(" ").filter(Boolean);
  if (dichas.length === 0 || dichas.length > fichadas.length) return false;
  return dichas.every((palabra, i) => palabra === fichadas[i]);
}

/** Lo que se sabe de quien llama, además del teléfono. */
export interface HouseholdHint {
  fullName?: string | null;
}

/**
 * Decide a qué ficha corresponde una llamada, entre las que comparten teléfono.
 *
 * Con una sola ficha responde esa y no mira el nombre: es el caso de siempre y
 * no debe cambiar de comportamiento porque ahora existan las familias.
 */
export function resolveHouseholdMatch(
  candidates: readonly HouseholdCandidate[],
  hint: HouseholdHint,
): HouseholdMatch {
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length === 1) return { kind: "one", customerId: candidates[0]!.id };

  const dicho = hint.fullName?.trim() ?? "";
  if (dicho === "") return { kind: "ambiguous", candidates: [...candidates] };

  const casan = candidates.filter((c) => nameMatches(dicho, c.fullName));

  if (casan.length === 1) return { kind: "one", customerId: casan[0]!.id };
  // Ninguno casa → NO se elige el primero: quien llama dijo un nombre que no
  // reconocemos, y reservar a nombre de otro de la casa es el fallo grave.
  // Varios casan (dos tocayos, o solo el nombre de pila) → tampoco.
  return {
    kind: "ambiguous",
    candidates: casan.length > 1 ? casan : [...candidates],
  };
}
