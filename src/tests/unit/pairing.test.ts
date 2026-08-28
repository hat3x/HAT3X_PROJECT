/**
 * Token de emparejamiento del agente (A1a).
 *
 * Es el secreto que comparten el panel y el agente instalado en el ordenador de
 * la clínica. Lo que se prueba aquí es lo que lo hace un secreto y no una
 * cadena bonita: que sea largo, impredecible y distinto cada vez.
 *
 * Importa porque este token es lo único —junto con la lista de orígenes— que
 * impide que una web cualquiera abierta en ese ordenador le pida al agente que
 * dispare una radiografía.
 */
import { describe, it, expect } from "vitest";

import { generatePairingToken, isValidPairingToken } from "@/lib/imaging/pairing";
import { PAIRING_TOKEN_MIN_LENGTH } from "@/lib/imaging/protocol";

describe("generatePairingToken", () => {
  it("cumple la longitud mínima que exige el protocolo", () => {
    expect(generatePairingToken().length).toBeGreaterThanOrEqual(PAIRING_TOKEN_MIN_LENGTH);
  });

  it("usa solo caracteres seguros de copiar y pegar", () => {
    // Sin símbolos raros: este token viaja por correo y alguien lo pega en el
    // fichero de configuración del agente a mano.
    expect(generatePairingToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("no repite: cincuenta tokens seguidos son cincuenta distintos", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePairingToken()));
    expect(tokens.size).toBe(50);
  });
});

describe("isValidPairingToken", () => {
  it("acepta uno recién generado", () => {
    expect(isValidPairingToken(generatePairingToken())).toBe(true);
  });

  it("rechaza uno demasiado corto para ser un secreto", () => {
    expect(isValidPairingToken("kairos123")).toBe(false);
  });

  it("rechaza el vacío y lo que no es texto", () => {
    expect(isValidPairingToken("")).toBe(false);
    expect(isValidPairingToken(null)).toBe(false);
    expect(isValidPairingToken(undefined)).toBe(false);
    expect(isValidPairingToken(42)).toBe(false);
  });

  it("rechaza caracteres fuera del alfabeto: delatan un copiado a medias", () => {
    // Un token con espacios o saltos de línea suele ser una selección mal hecha
    // al copiarlo del correo, y fallaría después con un 401 críptico.
    expect(isValidPairingToken("a".repeat(20) + " " + "b".repeat(20))).toBe(false);
  });
});
