import { describe, it, expect } from "vitest";
import { calcularUptime, formatearUptime } from "@/lib/uptime/calcular";

describe("cálculo de uptime", () => {
  it("sin datos devuelve null, no 0 ni 100", () => {
    // Un servicio recién dado de alta no está «caído al 0 %» ni «perfecto»:
    // es que no se sabe. Mentir aquí destruye la confianza en la cifra.
    expect(calcularUptime([], [])).toBeNull();
  });

  it("todo correcto es 100", () => {
    expect(calcularUptime([{ ok: true }, { ok: true }], [])).toBe(100);
  });

  it("todo mal es 0", () => {
    expect(calcularUptime([{ ok: false }, { ok: false }], [])).toBe(0);
  });

  it("mezcla detalle y agregados en una sola cifra", () => {
    // 2 de 2 en detalle + 96 de 100 agregados = 98 de 102
    const r = calcularUptime([{ ok: true }, { ok: true }], [{ total: 100, ok: 96 }]);
    expect(r).toBeCloseTo(96.1, 1);
  });

  it("la cifra NO cambia al consolidar los mismos datos", () => {
    const detalle = [
      { ok: true }, { ok: true }, { ok: false }, { ok: true }, { ok: true },
      { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
    ];
    const antes = calcularUptime(detalle, []);
    // Los mismos diez resultados, ya consolidados en un agregado.
    const despues = calcularUptime([], [{ total: 10, ok: 9 }]);
    expect(despues).toBe(antes);
  });

  it("tampoco cambia consolidando solo una parte", () => {
    const detalle = [
      { ok: true }, { ok: true }, { ok: false }, { ok: true }, { ok: true },
      { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
    ];
    const entero = calcularUptime(detalle, []);
    // Los cinco primeros consolidados, los cinco últimos aún en detalle.
    const parcial = calcularUptime(detalle.slice(5), [{ total: 5, ok: 4 }]);
    expect(parcial).toBe(entero);
  });

  it("redondea a un decimal", () => {
    expect(calcularUptime([], [{ total: 1000, ok: 972 }])).toBe(97.2);
    expect(calcularUptime([], [{ total: 3, ok: 2 }])).toBe(66.7);
  });

  it("ignora agregados vacíos en lugar de dividir entre cero", () => {
    expect(calcularUptime([{ ok: true }], [{ total: 0, ok: 0 }])).toBe(100);
  });

  it("suma varios agregados", () => {
    expect(calcularUptime([], [{ total: 50, ok: 50 }, { total: 50, ok: 40 }])).toBe(90);
  });
});

describe("formato de uptime", () => {
  it("muestra el porcentaje con coma decimal, a la española", () => {
    expect(formatearUptime(97.2)).toBe("97,2 %");
  });

  it("el 100 se muestra entero, sin decimal inútil", () => {
    expect(formatearUptime(100)).toBe("100 %");
  });

  it("el 0 también se muestra entero", () => {
    expect(formatearUptime(0)).toBe("0 %");
  });

  it("sin datos lo dice, en vez de inventarse un número", () => {
    expect(formatearUptime(null)).toBe("sin datos");
  });
});
