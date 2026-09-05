/**
 * Lógica PURA de la firma del consentimiento (A2 del roadmap de odontología).
 *
 * Cubre lo que decide si un trazo capturado en la tableta cuenta como firma y
 * cómo se dibuja. El SELLADO criptográfico NO vive aquí: es responsabilidad del
 * servidor, porque una huella calculada en el navegador no prueba nada — el
 * consentimiento lo tiene que poder validar quien no es parte.
 */
import { describe, it, expect } from "vitest";

import {
  isMeaningfulSignature,
  signatureBounds,
  strokesToSvgPath,
  type SignatureStroke,
} from "@/lib/dental/signature";

/** Trazo realista: una rúbrica corta, doce puntos con presión variable. */
const RUBRICA: SignatureStroke[] = [
  [
    { x: 10, y: 40, p: 0.3, t: 0 },
    { x: 18, y: 22, p: 0.6, t: 16 },
    { x: 26, y: 48, p: 0.7, t: 32 },
    { x: 34, y: 20, p: 0.8, t: 48 },
    { x: 42, y: 50, p: 0.7, t: 64 },
    { x: 51, y: 24, p: 0.6, t: 80 },
  ],
  [
    { x: 8, y: 55, p: 0.4, t: 140 },
    { x: 24, y: 52, p: 0.5, t: 156 },
    { x: 40, y: 54, p: 0.5, t: 172 },
    { x: 58, y: 50, p: 0.4, t: 188 },
    { x: 70, y: 53, p: 0.3, t: 204 },
    { x: 78, y: 51, p: 0.2, t: 220 },
  ],
];

/** Un toque con el dedo: dos puntos pegados, sin recorrido. */
const TOQUE: SignatureStroke[] = [
  [
    { x: 30, y: 30, p: 0.5, t: 0 },
    { x: 31, y: 30, p: 0.5, t: 12 },
  ],
];

describe("isMeaningfulSignature", () => {
  it("acepta una rúbrica con recorrido y puntos suficientes", () => {
    expect(isMeaningfulSignature(RUBRICA)).toBe(true);
  });

  it("rechaza un toque: no hay recorrido que valga como firma", () => {
    expect(isMeaningfulSignature(TOQUE)).toBe(false);
  });

  it("rechaza el lienzo vacío", () => {
    expect(isMeaningfulSignature([])).toBe(false);
  });

  it("rechaza una raya larga con muy pocos puntos: deslizar el dedo no es firmar", () => {
    const raya: SignatureStroke[] = [
      [
        { x: 0, y: 40, p: 0.5, t: 0 },
        { x: 200, y: 40, p: 0.5, t: 20 },
      ],
    ];
    expect(isMeaningfulSignature(raya)).toBe(false);
  });
});

describe("signatureBounds", () => {
  it("devuelve la caja que encierra todos los trazos", () => {
    expect(signatureBounds(RUBRICA)).toEqual({
      minX: 8,
      minY: 20,
      maxX: 78,
      maxY: 55,
    });
  });

  it("devuelve null si no hay ningún punto", () => {
    expect(signatureBounds([])).toBeNull();
  });
});

describe("strokesToSvgPath", () => {
  it("abre un subpath por trazo, para que no se unan entre sí", () => {
    const d = strokesToSvgPath(RUBRICA);
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it("empieza en el primer punto del primer trazo", () => {
    expect(strokesToSvgPath(RUBRICA)).toMatch(/^M10 40/);
  });

  it("devuelve cadena vacía sin trazos", () => {
    expect(strokesToSvgPath([])).toBe("");
  });
});
