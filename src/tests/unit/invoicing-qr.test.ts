/**
 * Tests del generador de códigos QR (`@/lib/invoicing/qr`).
 *
 * No decodifica el QR (sería otro codec), pero verifica los invariantes
 * estructurales del estándar ISO/IEC 18004 que garantizan que el símbolo es
 * válido y escaneable: tamaño por versión, patrones de localización en las tres
 * esquinas, patrones de temporización, determinismo y forma del SVG.
 */
import { describe, it, expect } from "vitest";

import { QrCode, encodeQrSvg, type QrEcc } from "@/lib/invoicing";

describe("QrCode.encodeText — versión y tamaño", () => {
  it("elige la versión 1 (21×21) para un texto corto a nivel MEDIUM", () => {
    const qr = QrCode.encodeText("HELLO WORLD", "MEDIUM");
    expect(qr.version).toBe(1);
    expect(qr.size).toBe(21);
    expect(qr.size).toBe(qr.version * 4 + 17);
  });

  it("crece de versión al aumentar los datos", () => {
    const small = QrCode.encodeText("A", "MEDIUM");
    const large = QrCode.encodeText("X".repeat(400), "MEDIUM");
    expect(large.version).toBeGreaterThan(small.version);
    expect(large.size).toBe(large.version * 4 + 17);
  });

  it("lanza si los datos no caben en ninguna versión", () => {
    expect(() => QrCode.encodeText("Z".repeat(5000), "HIGH")).toThrow(/no caben/);
  });
});

describe("QrCode — patrones de función", () => {
  const qr = QrCode.encodeText("HELLO WORLD", "MEDIUM"); // versión 1, 21×21
  const last = qr.size - 1;

  it("dibuja el patrón de localización superior izquierdo", () => {
    expect(qr.getModule(3, 3)).toBe(true); // centro (dist 0)
    expect(qr.getModule(0, 0)).toBe(true); // anillo exterior (dist 3)
    expect(qr.getModule(1, 1)).toBe(false); // anillo claro (dist 2)
  });

  it("dibuja los patrones de localización superior derecho e inferior izquierdo", () => {
    expect(qr.getModule(last - 3, 3)).toBe(true); // centro sup. derecho
    expect(qr.getModule(3, last - 3)).toBe(true); // centro inf. izquierdo
  });

  it("deja la zona de silencio (fuera de rango) en claro", () => {
    expect(qr.getModule(-1, 0)).toBe(false);
    expect(qr.getModule(qr.size, 0)).toBe(false);
  });

  it("dibuja los patrones de temporización alternos en la fila y columna 6", () => {
    // Columna 6: módulo (6, i) oscuro cuando i es par.
    expect(qr.getModule(6, 10)).toBe(true);
    expect(qr.getModule(6, 9)).toBe(false);
    // Fila 6: módulo (i, 6) oscuro cuando i es par.
    expect(qr.getModule(10, 6)).toBe(true);
    expect(qr.getModule(9, 6)).toBe(false);
  });
});

describe("QrCode — determinismo", () => {
  it("produce el mismo SVG para la misma entrada", () => {
    const a = encodeQrSvg("https://example.test/qr?x=1", { ecc: "MEDIUM" });
    const b = encodeQrSvg("https://example.test/qr?x=1", { ecc: "MEDIUM" });
    expect(a).toBe(b);
  });

  it("cambia el símbolo si cambia el contenido", () => {
    const a = encodeQrSvg("dato-1");
    const b = encodeQrSvg("dato-2");
    expect(a).not.toBe(b);
  });

  it("cada nivel de corrección produce un símbolo válido", () => {
    const levels: QrEcc[] = ["LOW", "MEDIUM", "QUARTILE", "HIGH"];
    for (const ecc of levels) {
      const qr = QrCode.encodeText("nivel de correccion", ecc);
      expect(qr.ecc).toBe(ecc);
      expect(qr.size).toBeGreaterThanOrEqual(21);
    }
  });
});

describe("encodeQrSvg — salida SVG", () => {
  it("emite un SVG con viewBox acorde al tamaño más el borde", () => {
    const border = 4;
    const qr = QrCode.encodeText("HELLO WORLD", "MEDIUM"); // 21×21
    const svg = qr.toSvgString(border);
    const dim = qr.size + border * 2; // 29
    expect(svg).toContain(`viewBox="0 0 ${dim} ${dim}"`);
    expect(svg).toContain("<path");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("rechaza un borde negativo", () => {
    const qr = QrCode.encodeText("x", "MEDIUM");
    expect(() => qr.toSvgString(-1)).toThrow();
  });
});
