/**
 * Lectura del UDI de un implante (A3).
 *
 * El Reglamento (UE) 2017/745 exige identificar cada producto sanitario
 * implantable por su UDI y poder seguirlo hasta el paciente. En la práctica eso
 * se traduce en una cosa muy concreta: cuando el fabricante retira un lote, la
 * clínica tiene que poder decir a quién se lo puso.
 *
 * Por eso el fallo que importa aquí no es "no lee el código": es **leerlo mal
 * sin avisar**. Un lote mal interpretado no da error en ninguna pantalla; se
 * descubre el día de la alerta sanitaria, cuando la lista de pacientes sale
 * vacía o incompleta. De ahí que estos tests insistan tanto en lo que NO debe
 * adivinarse.
 *
 * El código viene de un DataMatrix GS1, con identificadores de aplicación:
 * (01) GTIN, (17) caducidad, (10) lote, (21) nº de serie, (11) fabricación.
 * Los de longitud fija se leen contando; los variables terminan en el separador
 * GS (ASCII 29) o al final de la cadena.
 */
import { describe, expect, it } from "vitest";

import { parseGs1Udi } from "@/lib/dental/udi";

/** Separador de campo variable que emite el lector (FNC1 → ASCII 29). */
const GS = "";

function ok(raw: string) {
  const r = parseGs1Udi(raw);
  if (!r.ok) throw new Error(`esperaba lectura correcta, dio: ${r.error}`);
  return r.udi;
}

describe("parseGs1Udi — forma con paréntesis (la impresa en la caja)", () => {
  it("saca GTIN, caducidad y lote", () => {
    const u = ok("(01)07612345678904(17)271231(10)LOT123");

    expect(u.gtin).toBe("07612345678904");
    expect(u.expiry).toBe("2027-12-31");
    expect(u.lot).toBe("LOT123");
  });

  it("saca el número de serie cuando lo lleva", () => {
    expect(ok("(01)07612345678904(21)SN-0001").serial).toBe("SN-0001");
  });
});

describe("parseGs1Udi — forma en crudo (la que emite el lector)", () => {
  it("lee campos de longitud fija contando dígitos, sin separador", () => {
    const u = ok("010761234567890417271231");

    expect(u.gtin).toBe("07612345678904");
    expect(u.expiry).toBe("2027-12-31");
  });

  it("un campo variable al final llega hasta el final de la cadena", () => {
    expect(ok("0107612345678904" + "10LOT123").lot).toBe("LOT123");
  });

  it("un campo variable seguido de otro dato termina en el separador", () => {
    const u = ok("0107612345678904" + "10LOT123" + GS + "21SN-0001");

    expect(u.lot).toBe("LOT123");
    expect(u.serial).toBe("SN-0001");
  });

  it("sin separador, el lote se queda con TODO lo que sigue", () => {
    // Es lo que manda la norma, y conviene que quede fijado: si el lector se
    // come el GS, el lote sale contaminado. No se puede adivinar donde
    // terminaba, asi que se lee tal cual y `serial` queda vacio — un lote raro
    // a la vista es mejor que uno recortado a ojo y creido.
    const u = ok("0107612345678904" + "10LOT12321SN-0001");

    expect(u.lot).toBe("LOT12321SN-0001");
    expect(u.serial).toBeNull();
  });
});

describe("parseGs1Udi — fechas", () => {
  it("día 00 significa fin de mes, no día cero", () => {
    // Regla de GS1 que se pasa por alto: `271200` es "diciembre de 2027", y
    // tratarlo como dia 0 produce una fecha invalida o el 30 de noviembre.
    expect(ok("(01)07612345678904(17)271200").expiry).toBe("2027-12-31");
  });

  it("resuelve fin de mes en febrero bisiesto", () => {
    expect(ok("(01)07612345678904(17)280200").expiry).toBe("2028-02-29");
  });

  it("lee también la fecha de fabricación", () => {
    expect(ok("(01)07612345678904(11)240115").manufactured).toBe("2024-01-15");
  });
});

describe("parseGs1Udi — lo que NO debe hacer", () => {
  it("no se inventa nada con una cadena que no es un UDI", () => {
    expect(parseGs1Udi("hola que tal").ok).toBe(false);
  });

  it("rechaza un GTIN incompleto en vez de guardar medio", () => {
    // Medio GTIN es peor que ninguno: parece valido en la ficha y no cruza con
    // el del fabricante el dia que hay que buscarlo.
    expect(parseGs1Udi("010761234").ok).toBe(false);
  });

  it("rechaza una caducidad imposible en vez de normalizarla", () => {
    expect(parseGs1Udi("(01)07612345678904(17)271345").ok).toBe(false);
  });

  it("conserva los identificadores que no interpreta, no los tira", () => {
    // Un AI desconocido puede ser justo el que pida una inspeccion. Se guarda
    // para que este en la ficha aunque nosotros no sepamos que significa.
    const u = ok("(01)07612345678904(240)REF-9");

    expect(u.unknown).toEqual([{ ai: "240", value: "REF-9" }]);
  });

  it("una cadena vacía no es un UDI", () => {
    expect(parseGs1Udi("   ").ok).toBe(false);
  });
});
