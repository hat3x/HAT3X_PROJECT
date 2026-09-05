/**
 * Tests de las utilidades PURAS del escaneo por cámara (`@/lib/loyalty/scan`).
 *
 * Son la lógica delicada del lector QR que SÍ se puede probar sin navegador: la
 * normalización del texto leído a un `qr_token` y la traducción de los fallos de
 * `getUserMedia` a un mensaje accionable. El componente de cámara en sí depende de
 * APIs del navegador (`mediaDevices`, ZXing) y queda fuera de los unitarios.
 */
import { describe, it, expect } from "vitest";

import {
  CAMERA_UNSUPPORTED_MESSAGE,
  cameraErrorMessage,
  normalizeScannedToken,
} from "@/lib/loyalty/scan";

describe("normalizeScannedToken", () => {
  it("devuelve el token en crudo recortando espacios (caso normal del carné)", () => {
    expect(normalizeScannedToken("  loy_abc123  ")).toBe("loy_abc123");
    expect(normalizeScannedToken("loy_abc123")).toBe("loy_abc123");
  });

  it("devuelve cadena vacía cuando el contenido no aporta token", () => {
    expect(normalizeScannedToken("")).toBe("");
    expect(normalizeScannedToken("   \n\t ")).toBe("");
  });

  it("extrae el token del parámetro ?token= o ?t= de una URL", () => {
    expect(normalizeScannedToken("https://salon.example/l?token=loy_abc123")).toBe(
      "loy_abc123",
    );
    expect(normalizeScannedToken("https://salon.example/scan?t=loy_xyz")).toBe(
      "loy_xyz",
    );
  });

  it("extrae el token del último segmento de ruta si no hay query", () => {
    expect(normalizeScannedToken("https://salon.example/l/loy_abc123")).toBe(
      "loy_abc123",
    );
    // Segmentos codificados se decodifican.
    expect(normalizeScannedToken("https://salon.example/l/loy%20abc")).toBe(
      "loy abc",
    );
  });

  it("no confunde texto plano que contiene ':' con una URL", () => {
    expect(normalizeScannedToken("cliente:loy_abc123")).toBe("cliente:loy_abc123");
  });
});

describe("cameraErrorMessage", () => {
  function domError(name: string): Error {
    const error = new Error(name);
    error.name = name;
    return error;
  }

  it("mapea permiso denegado (NotAllowedError / SecurityError)", () => {
    expect(cameraErrorMessage(domError("NotAllowedError"))).toMatch(/permiso/i);
    expect(cameraErrorMessage(domError("SecurityError"))).toMatch(/permiso/i);
  });

  it("mapea ausencia de cámara (NotFoundError / OverconstrainedError)", () => {
    expect(cameraErrorMessage(domError("NotFoundError"))).toMatch(/cámara/i);
    expect(cameraErrorMessage(domError("OverconstrainedError"))).toMatch(/cámara/i);
  });

  it("mapea cámara ocupada (NotReadableError / TrackStartError)", () => {
    expect(cameraErrorMessage(domError("NotReadableError"))).toMatch(/ocupada/i);
    expect(cameraErrorMessage(domError("TrackStartError"))).toMatch(/ocupada/i);
  });

  it("cae a un mensaje genérico para errores desconocidos o no-Error", () => {
    expect(cameraErrorMessage(domError("WeirdError"))).toMatch(/no se ha podido/i);
    expect(cameraErrorMessage("cadena suelta")).toMatch(/no se ha podido/i);
    expect(cameraErrorMessage(undefined)).toMatch(/no se ha podido/i);
  });

  it("expone un mensaje de contexto no seguro para navegadores sin cámara", () => {
    expect(CAMERA_UNSUPPORTED_MESSAGE).toMatch(/HTTPS/);
  });
});
