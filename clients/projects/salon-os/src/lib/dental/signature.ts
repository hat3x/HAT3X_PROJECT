/**
 * Firma manuscrita del consentimiento — lógica PURA (sin IO, sin React).
 *
 * A2 del roadmap de odontología. Hoy `consents.signed_by_patient` es un `text`
 * donde se teclea el nombre: eso es una anotación, no una firma. Este módulo
 * cubre la parte que se puede razonar sin servidor —qué trazo cuenta como firma
 * y cómo se dibuja—, y lo comparten el lienzo de captura (cliente) y el
 * generador del PDF (servidor).
 *
 * El SELLADO criptográfico NO vive aquí a propósito: una huella calculada en el
 * navegador no prueba nada, porque quien firma controla el navegador. El sello
 * se calcula en el servidor contra el texto exacto de la plantilla.
 */

/** Un punto del trazo, tal y como lo entrega Pointer Events. */
export interface SignaturePoint {
  /** Coordenada X en el sistema del lienzo. */
  x: number;
  /** Coordenada Y en el sistema del lienzo. */
  y: number;
  /** Presión normalizada 0..1. Los ratones reportan 0.5 constante. */
  p: number;
  /** Milisegundos desde el inicio de la captura. */
  t: number;
}

/** Un trazo continuo: desde que se apoya el lápiz hasta que se levanta. */
export type SignatureStroke = SignaturePoint[];

/** Caja que encierra todos los puntos de una firma. */
export interface SignatureBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Puntos mínimos para que un trazo sea una firma y no un gesto.
 *
 * Una rúbrica real capturada a 60 Hz deja decenas de puntos; un toque deja dos
 * o tres. El umbral es deliberadamente bajo: el objetivo es descartar el gesto
 * accidental, no juzgar la caligrafía de nadie.
 */
const MIN_POINTS = 8;

/**
 * Recorrido mínimo, en unidades del lienzo, sumando todos los trazos.
 *
 * Se exige ADEMÁS del número de puntos, no en su lugar: deslizar el dedo de
 * lado a lado recorre mucha distancia con dos puntos, y no es una firma.
 */
const MIN_PATH_LENGTH = 60;

/** Longitud total recorrida, sumando los segmentos de todos los trazos. */
function pathLength(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1]!;
      const b = stroke[i]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

/**
 * ¿El trazo capturado cuenta como firma?
 *
 * Exige las DOS condiciones a la vez —puntos y recorrido— porque cada una sola
 * deja pasar un caso claro: un toque tiene poco de ambas, pero un deslizamiento
 * recto tiene recorrido de sobra con solo dos puntos.
 */
export function isMeaningfulSignature(strokes: SignatureStroke[]): boolean {
  const points = strokes.reduce((n, stroke) => n + stroke.length, 0);
  if (points < MIN_POINTS) return false;
  return pathLength(strokes) >= MIN_PATH_LENGTH;
}

/**
 * Caja que encierra todos los puntos, o `null` si no hay ninguno.
 *
 * La usa el recorte del PDF: firmar en una esquina del lienzo no debe producir
 * una imagen casi vacía.
 */
export function signatureBounds(strokes: SignatureStroke[]): SignatureBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const point of stroke) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Redondea a dos decimales sin arrastrar ceros ("10", no "10.00"). */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Convierte los trazos en el atributo `d` de un `<path>`.
 *
 * Cada trazo abre su propio subpath con `M`: si se concatenaran, el
 * levantamiento del lápiz entre trazos se dibujaría como una línea recta que
 * nadie trazó.
 */
export function strokesToSvgPath(strokes: SignatureStroke[]): string {
  const subpaths: string[] = [];

  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;

    const commands = [`M${round2(first.x)} ${round2(first.y)}`];
    for (const point of rest) {
      commands.push(`L${round2(point.x)} ${round2(point.y)}`);
    }
    subpaths.push(commands.join(" "));
  }

  return subpaths.join(" ");
}
