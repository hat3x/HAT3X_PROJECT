import { describe, it, expect } from "vitest";
import { firmar, verificarFirma, clavePublicaDe, generarClavePem } from "@/lib/facturas/firma";

describe("firmar / verificarFirma", () => {
  const { privada, publica } = generarClavePem();
  const cadena = "IDEmisorFactura=89890001K&NumSerieFactura=A-1&Huella=";

  it("una firma hecha con la privada verifica con la pública", () => {
    const firma = firmar(cadena, privada);
    expect(verificarFirma(cadena, firma, publica)).toBe(true);
  });

  it("una firma alterada no verifica", () => {
    const firma = firmar(cadena, privada);
    // Cambia el último carácter base64 por otro válido pero distinto: sigue
    // siendo base64 decodificable, solo que ya no es la firma que se generó.
    const alterada = firma.slice(0, -1) + (firma.endsWith("A") ? "B" : "A");
    expect(verificarFirma(cadena, alterada, publica)).toBe(false);
  });

  it("una cadena alterada no verifica con la firma original", () => {
    const firma = firmar(cadena, privada);
    expect(verificarFirma(cadena + " ", firma, publica)).toBe(false);
  });

  it("la pública derivada de la privada verifica igual que la generada junto a ella", () => {
    const derivada = clavePublicaDe(privada);
    const firma = firmar(cadena, privada);
    expect(verificarFirma(cadena, firma, derivada)).toBe(true);
  });

  it("una firma con base64 corrupto no lanza: devuelve false", () => {
    expect(verificarFirma(cadena, "esto no es base64 válido ni firma", publica)).toBe(false);
  });

  it("dos claves generadas por separado no son intercambiables", () => {
    const otra = generarClavePem();
    const firma = firmar(cadena, privada);
    expect(verificarFirma(cadena, firma, otra.publica)).toBe(false);
  });
});
