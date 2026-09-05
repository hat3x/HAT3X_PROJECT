/**
 * Lectura del UDI de un producto sanitario implantable (A3).
 *
 * El Reglamento (UE) 2017/745 obliga a identificar cada implante por su UDI y a
 * poder seguirlo hasta el paciente. Lo que eso significa el día que importa:
 * cuando un fabricante retira un lote, la clínica tiene que poder decir a quién
 * se lo puso. Sin eso, ninguna clínica que ponga implantes puede usar Salón OS
 * como sistema único.
 *
 * ── El fallo que hay que evitar ──────────────────────────────────────────────
 * No es "no leer el código": es leerlo mal y no avisar. Un lote mal
 * interpretado no rompe ninguna pantalla — se descubre el día de la alerta
 * sanitaria, cuando la lista de pacientes sale incompleta. Por eso este módulo
 * **falla en cerrado**: ante cualquier duda devuelve error en lugar de un valor
 * a medias, y los identificadores que no entiende los conserva en vez de
 * tirarlos.
 *
 * ── El formato ───────────────────────────────────────────────────────────────
 * Un DataMatrix GS1 es una ristra de pares (identificador de aplicación, valor).
 * Los AI de longitud fija se leen contando caracteres; los variables terminan
 * en el separador GS (ASCII 29, el FNC1 del lector) o al final de la cadena.
 * La caja imprime además la forma legible con paréntesis: `(01)…(17)…(10)…`.
 */

/** Separador de campo variable: FNC1 tal y como lo emite el lector. */
const GS = "";

/** Longitud fija de los AI que la tienen. Los demás son variables. */
const FIXED_LENGTH: Record<string, number> = {
  "00": 18, // SSCC
  "01": 14, // GTIN — el identificador del dispositivo
  "02": 14,
  "11": 6, // fabricación   YYMMDD
  "12": 6, // vencimiento   YYMMDD
  "13": 6, // envasado      YYMMDD
  "15": 6, // consumo pref. YYMMDD
  "16": 6, // venta hasta   YYMMDD
  "17": 6, // caducidad     YYMMDD
  "20": 2,
};

export interface Udi {
  /** (01) GTIN — identifica el modelo de implante, no la unidad. */
  gtin: string | null;
  /** (10) lote: lo que se busca en una alerta sanitaria. */
  lot: string | null;
  /** (21) número de serie, cuando la unidad lo lleva. */
  serial: string | null;
  /** (17) caducidad, ISO `YYYY-MM-DD`. */
  expiry: string | null;
  /** (11) fabricación, ISO `YYYY-MM-DD`. */
  manufactured: string | null;
  /** AI presentes que no interpretamos. Se guardan, no se descartan. */
  unknown: Array<{ ai: string; value: string }>;
  /** La cadena tal y como la entregó el lector. */
  raw: string;
}

export type UdiResult = { ok: true; udi: Udi } | { ok: false; error: string };

/**
 * `YYMMDD` → ISO. El siglo se resuelve con la ventana de GS1 (00–49 → 20xx).
 *
 * Con día `00`, GS1 dice "fin de mes", no "día cero": `271200` es el 31 de
 * diciembre de 2027. Tratarlo literalmente da una fecha inválida o, peor, el
 * último día del mes ANTERIOR.
 */
function gs1DateToIso(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = yy <= 49 ? 2000 + yy : 1900 + yy;
  // Día 0 del mes siguiente = último día de este mes, y de paso cubre bisiestos.
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd > lastDay) return null;
  const day = dd === 0 ? lastDay : dd;
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(year, 4)}-${p(mm)}-${p(day)}`;
}

/** Trocea la forma legible `(01)valor(17)valor…`. */
function parseParenthesised(raw: string): Array<[string, string]> | null {
  const pairs: Array<[string, string]> = [];
  const re = /\((\d{2,4})\)([^(]*)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(raw)) !== null) {
    if (match.index !== consumed) return null; // hay basura entre grupos
    pairs.push([match[1] as string, (match[2] as string).trim()]);
    consumed = re.lastIndex;
  }
  return consumed === raw.length && pairs.length > 0 ? pairs : null;
}

/** Trocea la forma en crudo, contando los fijos y cortando los variables en GS. */
function parseRaw(raw: string): Array<[string, string]> | null {
  const pairs: Array<[string, string]> = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === GS) {
      i += 1;
      continue;
    }
    const ai = raw.slice(i, i + 2);
    if (!/^\d{2}$/.test(ai)) return null;
    i += 2;
    const fixed = FIXED_LENGTH[ai];
    if (fixed !== undefined) {
      const value = raw.slice(i, i + fixed);
      // Un campo fijo incompleto se rechaza: medio GTIN parece válido en la
      // ficha y no cruza con el del fabricante cuando hay que buscarlo.
      if (value.length !== fixed) return null;
      pairs.push([ai, value]);
      i += fixed;
    } else {
      const end = raw.indexOf(GS, i);
      const value = end === -1 ? raw.slice(i) : raw.slice(i, end);
      if (value.length === 0) return null;
      pairs.push([ai, value]);
      i = end === -1 ? raw.length : end + 1;
    }
  }
  return pairs.length > 0 ? pairs : null;
}

/**
 * Interpreta el UDI que devuelve el lector, en cualquiera de sus dos formas.
 *
 * Devuelve error —nunca un resultado a medias— si la cadena no es un UDI, si un
 * campo de longitud fija viene incompleto o si una fecha es imposible.
 */
export function parseGs1Udi(raw: string): UdiResult {
  const input = raw.trim();
  if (input.length === 0) {
    return { ok: false, error: "El código está vacío." };
  }

  const pairs = input.includes("(") ? parseParenthesised(input) : parseRaw(input);
  if (pairs === null) {
    return { ok: false, error: "El código no tiene el formato de un UDI GS1." };
  }

  const udi: Udi = {
    gtin: null,
    lot: null,
    serial: null,
    expiry: null,
    manufactured: null,
    unknown: [],
    raw: input,
  };

  for (const [ai, value] of pairs) {
    switch (ai) {
      case "01":
        if (!/^\d{14}$/.test(value)) {
          return { ok: false, error: "El GTIN debe tener 14 dígitos." };
        }
        udi.gtin = value;
        break;
      case "10":
        udi.lot = value;
        break;
      case "21":
        udi.serial = value;
        break;
      case "17": {
        const iso = gs1DateToIso(value);
        if (iso === null) {
          return { ok: false, error: `Fecha de caducidad no válida: ${value}.` };
        }
        udi.expiry = iso;
        break;
      }
      case "11": {
        const iso = gs1DateToIso(value);
        if (iso === null) {
          return { ok: false, error: `Fecha de fabricación no válida: ${value}.` };
        }
        udi.manufactured = iso;
        break;
      }
      default:
        udi.unknown.push({ ai, value });
    }
  }

  return { ok: true, udi };
}
