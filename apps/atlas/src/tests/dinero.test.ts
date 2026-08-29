// src/tests/dinero.test.ts
import { describe, it, expect } from "vitest";
import { aCentimos, formatear, desglosar } from "@/lib/dinero";

describe("a céntimos", () => {
  it("acepta enteros y decimales", () => {
    expect(aCentimos("350")).toBe(35000);
    expect(aCentimos("350.90")).toBe(35090);
    expect(aCentimos(290)).toBe(29000);
  });

  // El teclado español pone coma. Rechazarla sería una trampa para el usuario.
  it("acepta la coma decimal", () => {
    expect(aCentimos("350,90")).toBe(35090);
  });

  // La razón de existir de todo el módulo.
  it("0,1 + 0,2 da exactamente 0,3", () => {
    expect(aCentimos("0.1")! + aCentimos("0.2")!).toBe(aCentimos("0.3"));
  });

  it("corta a dos decimales sin arrastrar el tercero", () => {
    expect(aCentimos("1.005")).toBe(101); // medio céntimo sube
    expect(aCentimos("1.004")).toBe(100);
  });

  // Devuelve null, no NaN ni 0: un importe vacío y un importe de cero euros
  // son cosas distintas, y confundirlos escribe ceros silenciosos en la base.
  it("lo que no es un importe da null", () => {
    expect(aCentimos("")).toBeNull();
    expect(aCentimos("pepe")).toBeNull();
    expect(aCentimos("-5")).toBeNull();
  });
});

describe("formatear", () => {
  it("enseña euros con dos decimales", () => {
    // Intl mete un espacio estrecho e irrompible antes del €; se normaliza
    // para que el aserto no dependa de ese carácter invisible.
    expect(formatear(35090).replace(/ | /g, " ")).toBe("350,90 €");
    expect(formatear(0).replace(/ | /g, " ")).toBe("0,00 €");
  });
});

describe("desglosar", () => {
  it("el 21 % de 290,00 son 60,90 y el total 350,90", () => {
    expect(desglosar(29000, 21)).toEqual({ base: 29000, cuota: 6090, total: 35090 });
  });

  // 1450 × 21 / 100 = 304,5 céntimos exactos. Que suba o baje no puede quedar
  // al azar de la implementación: se fija aquí, al alza.
  it("el medio céntimo sube", () => {
    expect(desglosar(1450, 21).cuota).toBe(305);
  });

  it("el total es siempre base más cuota, sin recalcular", () => {
    const d = desglosar(12345, 21);
    expect(d.total).toBe(d.base + d.cuota);
  });

  it("con IVA cero la cuota es cero", () => {
    expect(desglosar(29000, 0)).toEqual({ base: 29000, cuota: 0, total: 29000 });
  });
});
