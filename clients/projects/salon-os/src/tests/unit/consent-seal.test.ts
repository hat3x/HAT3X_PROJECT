/**
 * Sellado del consentimiento firmado (A2 del roadmap de odontología).
 *
 * La firma sola no prueba nada: hay que poder demostrar QUÉ se firmó. El sello
 * ata la firma al texto exacto de la plantilla, de modo que si alguien edita el
 * consentimiento después, la firma deja de validar en lugar de quedarse
 * silenciosamente colgada de un texto que el paciente nunca leyó.
 *
 * Complementa a `consent-signature.test.ts`, que cubre el trazo. Aquí no hay
 * trazo: hay contenido y huella.
 */
import { describe, it, expect } from "vitest";

import {
  consentFingerprint,
  verifyConsentSeal,
  type ConsentSealInput,
} from "@/lib/dental/consent-seal";

const IMPLANTE: ConsentSealInput = {
  title: "Consentimiento informado para implante dental",
  body: "Se me ha explicado el procedimiento, sus alternativas y sus riesgos.",
  templateVersion: "v1",
};

describe("consentFingerprint", () => {
  it("devuelve un SHA-256 en hexadecimal", () => {
    expect(consentFingerprint(IMPLANTE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("es estable: el mismo contenido da siempre la misma huella", () => {
    expect(consentFingerprint(IMPLANTE)).toBe(consentFingerprint({ ...IMPLANTE }));
  });

  it("cambia si se edita el cuerpo del consentimiento", () => {
    const editado = { ...IMPLANTE, body: IMPLANTE.body + " Y acepto el presupuesto." };
    expect(consentFingerprint(editado)).not.toBe(consentFingerprint(IMPLANTE));
  });

  it("cambia si se publica una versión nueva de la plantilla", () => {
    const v2 = { ...IMPLANTE, templateVersion: "v2" };
    expect(consentFingerprint(v2)).not.toBe(consentFingerprint(IMPLANTE));
  });

  it("distingue contenidos que solo se diferencian en dónde corta un campo", () => {
    // Sin longitudes explícitas, "ab"+"c" y "a"+"bc" se concatenarían igual y
    // colisionarían: dos consentimientos distintos con la misma huella.
    const a = consentFingerprint({ title: "ab", body: "c", templateVersion: "v1" });
    const b = consentFingerprint({ title: "a", body: "bc", templateVersion: "v1" });
    expect(a).not.toBe(b);
  });

  it("trata el cuerpo vacío y el cuerpo ausente como contenidos distintos", () => {
    const vacio = consentFingerprint({ ...IMPLANTE, body: "" });
    const ausente = consentFingerprint({ ...IMPLANTE, body: null });
    expect(vacio).not.toBe(ausente);
  });
});

describe("verifyConsentSeal", () => {
  it("sin firma todavía: el consentimiento está pendiente", () => {
    expect(verifyConsentSeal({ ...IMPLANTE, signatureHash: null })).toBe("sin_firma");
  });

  it("firma válida cuando la huella coincide con el texto guardado", () => {
    const sellado = { ...IMPLANTE, signatureHash: consentFingerprint(IMPLANTE) };
    expect(verifyConsentSeal(sellado)).toBe("valida");
  });

  it("detecta que la plantilla se editó DESPUÉS de firmar", () => {
    const firmadoAntes = consentFingerprint(IMPLANTE);
    const editadoDespues = {
      ...IMPLANTE,
      body: "Texto sustituido después de que el paciente firmara.",
      signatureHash: firmadoAntes,
    };
    expect(verifyConsentSeal(editadoDespues)).toBe("plantilla_cambiada");
  });
});
