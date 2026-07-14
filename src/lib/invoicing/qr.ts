/**
 * Generador de códigos QR sin dependencias (ISO/IEC 18004).
 *
 * ── Por qué propio ───────────────────────────────────────────────────────────
 * El QR de cotejo de la factura es un elemento fiscal: debe generarse de forma
 * autónoma y determinista, sin librerías externas ni llamadas de red. Este módulo
 * implementa el algoritmo estándar (modo BYTE, corrección de errores Reed-Solomon,
 * selección de máscara por penalización) y devuelve el QR como SVG embebible en el
 * documento imprimible.
 *
 * Solo se usa el MODO BYTE (8 bits): la URL de cotejo es ASCII/UTF-8 y el modo
 * byte cubre cualquier contenido sin ramas de codificación adicionales. La versión
 * (tamaño) se elige automáticamente como la menor que admita los datos al nivel de
 * corrección pedido; para Veri*factu la AEAT exige nivel **M** (medio).
 *
 * El álgebra de Galois GF(256), las tablas de bloques ECC y la puntuación de
 * máscaras siguen la especificación al pie de la letra; alterarlas rompería la
 * lecturabilidad del código.
 */

/** Nivel de corrección de errores (redundancia). Veri*factu exige `MEDIUM`. */
export type QrEcc = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

/** Bits de formato de cada nivel (van al patrón de formato del QR). */
const ECC_FORMAT_BITS: Record<QrEcc, number> = {
  LOW: 1,
  MEDIUM: 0,
  QUARTILE: 3,
  HIGH: 2,
};

/** Índice de fila de cada nivel en las tablas de bloques ECC. */
const ECC_ORDINAL: Record<QrEcc, number> = {
  LOW: 0,
  MEDIUM: 1,
  QUARTILE: 2,
  HIGH: 3,
};

// Tablas de la especificación: nº de codewords de ECC por bloque y nº de bloques
// de ECC, por [nivel][versión]. El índice 0 de cada fila (versión 0) no se usa.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // Versión:  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // LOW
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // MEDIUM
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // QUARTILE
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // HIGH
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // Versión: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // LOW
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // MEDIUM
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // QUARTILE
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // HIGH
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// Constantes de penalización de máscaras (§8.8 de la especificación).
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** `true` si el bit `i` (desde el menos significativo) de `x` está a 1. */
function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/** Multiplicación en GF(256) con el polinomio de la especificación (0x11D). */
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Coeficientes del divisor de Reed-Solomon (producto de (x − r^i)). */
function reedSolomonComputeDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) {
    throw new RangeError("Grado de Reed-Solomon fuera de rango");
  }
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i += 1) result.push(0);
  result.push(1); // el coeficiente de mayor grado empieza en 1

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = reedSolomonMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

/** Resto (codewords de ECC) de dividir `data` por `divisor` en GF(256). */
function reedSolomonComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = result[i]! ^ reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

/** Nº de módulos de datos (bits) en bruto de una versión, sin ECC. */
function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Nº de codewords de DATOS (sin ECC) de una versión a un nivel de corrección. */
function getNumDataCodewords(version: number, ecc: QrEcc): number {
  const ord = ECC_ORDINAL[ecc];
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ord]![version]! * NUM_ERROR_CORRECTION_BLOCKS[ord]![version]!
  );
}

/** Bits del campo "cuenta de caracteres" del modo byte según la versión. */
function byteModeCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/**
 * Código QR construido: matriz de módulos booleanos (`true` = oscuro) y su tamaño.
 * Inmutable una vez creado.
 */
export class QrCode {
  /** Lado del QR en módulos (21 para la versión 1, +4 por versión). */
  readonly size: number;
  /** Máscara aplicada (0–7). */
  readonly mask: number;

  private readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  private constructor(
    readonly version: number,
    readonly ecc: QrEcc,
    dataCodewords: readonly number[],
    mask: number,
  ) {
    if (version < MIN_VERSION || version > MAX_VERSION) {
      throw new RangeError("Versión de QR fuera de rango");
    }
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    let chosenMask = mask;
    if (chosenMask === -1) {
      let minPenalty = Infinity;
      for (let i = 0; i < 8; i += 1) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          chosenMask = i;
          minPenalty = penalty;
        }
        this.applyMask(i); // deshacer (XOR de nuevo)
      }
    }
    this.mask = chosenMask;
    this.applyMask(chosenMask);
    this.drawFormatBits(chosenMask);
  }

  /**
   * Codifica un texto (UTF-8, modo byte) en un QR del nivel de corrección dado,
   * eligiendo automáticamente la menor versión que lo admita y la mejor máscara.
   */
  static encodeText(text: string, ecc: QrEcc = "MEDIUM"): QrCode {
    const data = Array.from(new TextEncoder().encode(text));
    return QrCode.encodeBytes(data, ecc);
  }

  /** Codifica bytes (0–255) en modo byte. */
  static encodeBytes(data: readonly number[], ecc: QrEcc): QrCode {
    const version = QrCode.chooseVersion(data.length, ecc);
    const dataCapacityBits = getNumDataCodewords(version, ecc) * 8;

    // Buffer de bits: cabecera de modo byte (0100), cuenta y datos.
    const bits: number[] = [];
    const appendBits = (value: number, length: number): void => {
      for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
    };
    appendBits(0x4, 4); // indicador de modo byte
    appendBits(data.length, byteModeCountBits(version));
    for (const b of data) appendBits(b, 8);

    // Terminador (hasta 4 ceros) y relleno a byte completo.
    appendBits(0, Math.min(4, dataCapacityBits - bits.length));
    appendBits(0, (8 - (bits.length % 8)) % 8);

    // Bytes de relleno alternos 0xEC / 0x11 hasta llenar la capacidad.
    for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) {
      appendBits(pad, 8);
    }

    // Bits → codewords de datos (bytes).
    const dataCodewords = new Array<number>(bits.length >> 3).fill(0);
    bits.forEach((bit, i) => {
      dataCodewords[i >>> 3]! |= bit << (7 - (i & 7));
    });

    return new QrCode(version, ecc, dataCodewords, -1);
  }

  /** Menor versión cuyo cupo de datos admite `numBytes` en modo byte. */
  private static chooseVersion(numBytes: number, ecc: QrEcc): number {
    for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
      const capacityBits = getNumDataCodewords(version, ecc) * 8;
      const usedBits = 4 + byteModeCountBits(version) + numBytes * 8;
      if (usedBits <= capacityBits) return version;
    }
    throw new RangeError(
      `Los datos (${numBytes} bytes) no caben en un QR al nivel de corrección ${ecc}`,
    );
  }

  /** `true` si el módulo (x, y) es oscuro. Fuera de rango → `false` (zona clara). */
  getModule(x: number, y: number): boolean {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y]![x]!;
  }

  /**
   * Renderiza el QR como cadena SVG. `border` es el nº de módulos de zona clara
   * (mínimo recomendado 4). Escala vía `viewBox`; el tamaño físico lo fija el CSS.
   */
  toSvgString(border = 4, dark = "#000000", light = "#ffffff"): string {
    if (border < 0) throw new RangeError("El borde no puede ser negativo");
    const dim = this.size + border * 2;
    const path: string[] = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.getModule(x, y)) {
          path.push(`M${x + border},${y + border}h1v1h-1z`);
        }
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
      `viewBox="0 0 ${dim} ${dim}" stroke="none" shape-rendering="crispEdges" ` +
      `role="img" aria-label="Código QR de cotejo de la factura">` +
      `<rect width="100%" height="100%" fill="${light}"/>` +
      `<path d="${path.join(" ")}" fill="${dark}"/>` +
      `</svg>`
    );
  }

  // ── Trazado de patrones de función ─────────────────────────────────────────

  private drawFunctionPatterns(): void {
    // Patrones de temporización (fila y columna 6).
    for (let i = 0; i < this.size; i += 1) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    // Tres patrones de localización (esquinas).
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    // Patrones de alineación (todas las combinaciones menos las esquinas finder).
    const alignPos = this.getAlignmentPatternPositions();
    const n = alignPos.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === n - 1) ||
          (i === n - 1 && j === 0)
        ) {
          continue;
        }
        this.drawAlignmentPattern(alignPos[i]!, alignPos[j]!);
      }
    }

    // Reserva de módulos de formato/versión (se rellenan con valores reales luego).
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // distancia Chebyshev
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      this.version === 32
        ? 26
        : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask; // 5 bits
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // 15 bits con máscara fija

    // Primera copia (alrededor del finder superior izquierdo).
    for (let i = 0; i <= 5; i += 1) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i += 1) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    // Segunda copia (repartida por los otros dos finders).
    for (let i = 0; i < 8; i += 1) {
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    }
    for (let i = 8; i < 15; i += 1) {
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    }
    this.setFunctionModule(8, this.size - 8, true); // módulo oscuro fijo
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem; // 18 bits

    for (let i = 0; i < 18; i += 1) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y]![x] = isDark;
    this.isFunction[y]![x] = true;
  }

  // ── ECC + intercalado y trazado de datos ────────────────────────────────────

  private addEccAndInterleave(data: readonly number[]): number[] {
    const ord = ECC_ORDINAL[this.ecc];
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ord]![this.version]!;
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ord]![this.version]!;
    const rawCodewords = Math.floor(getNumRawDataModules(this.version) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i += 1) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += dat.length;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // celda de relleno para intercalar
      blocks.push(dat.concat(ecc));
    }

    // Intercalado columna a columna, saltando la celda de relleno de los cortos.
    const result: number[] = [];
    const firstBlock = blocks[0]!;
    for (let i = 0; i < firstBlock.length; i += 1) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(block[i]!);
        }
      });
    }
    return result;
  }

  private drawCodewords(data: readonly number[]): void {
    let i = 0; // índice de bit dentro de `data`
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // saltar la columna de temporización
      for (let vert = 0; vert < this.size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y]![x]! && i < data.length * 8) {
            this.modules[y]![x] = getBit(data[i >>> 3]!, 7 - (i & 7));
            i += 1;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: throw new RangeError("Máscara de QR fuera de rango");
        }
        if (!this.isFunction[y]![x]! && invert) {
          this.modules[y]![x] = !this.modules[y]![x]!;
        }
      }
    }
  }

  // ── Puntuación de máscaras (§8.8) ───────────────────────────────────────────

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Regla 1: rachas horizontales; Regla 3: patrones tipo finder por fila.
    for (let y = 0; y < size; y += 1) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x += 1) {
        if (this.modules[y]![x]! === runColor) {
          runX += 1;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result += 1;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y]![x]!;
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }

    // Regla 1 y 3 en vertical.
    for (let x = 0; x < size; x += 1) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y += 1) {
        if (this.modules[y]![x]! === runColor) {
          runY += 1;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result += 1;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y]![x]!;
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }

    // Regla 2: bloques 2×2 del mismo color.
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = this.modules[y]![x]!;
        if (
          color === this.modules[y]![x + 1]! &&
          color === this.modules[y + 1]![x]! &&
          color === this.modules[y + 1]![x + 1]!
        ) {
          result += PENALTY_N2;
        }
      }
    }

    // Regla 4: desviación de la proporción de módulos oscuros respecto al 50 %.
    let dark = 0;
    for (const row of this.modules) for (const cell of row) if (cell) dark += 1;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(runHistory: readonly number[]): number {
    const n = runHistory[1]!;
    const core =
      n > 0 &&
      runHistory[2] === n &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n;
    return (
      (core && runHistory[0]! >= n * 4 && runHistory[6]! >= n ? 1 : 0) +
      (core && runHistory[6]! >= n * 4 && runHistory[0]! >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    runHistory: number[],
  ): number {
    let runLength = currentRunLength;
    if (currentRunColor) {
      this.finderPenaltyAddHistory(runLength, runHistory);
      runLength = 0;
    }
    runLength += this.size; // borde claro terminal
    this.finderPenaltyAddHistory(runLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  private finderPenaltyAddHistory(currentRunLength: number, runHistory: number[]): void {
    let runLength = currentRunLength;
    if (runHistory[0] === 0) runLength += this.size; // borde claro inicial
    runHistory.pop();
    runHistory.unshift(runLength);
  }
}

/**
 * Atajo para el documento: devuelve directamente el SVG del QR de un texto.
 * Nivel `MEDIUM` por defecto (el que exige Veri*factu).
 */
export function encodeQrSvg(
  text: string,
  options: { ecc?: QrEcc; border?: number; dark?: string; light?: string } = {},
): string {
  const qr = QrCode.encodeText(text, options.ecc ?? "MEDIUM");
  return qr.toSvgString(options.border ?? 4, options.dark ?? "#000000", options.light ?? "#ffffff");
}
