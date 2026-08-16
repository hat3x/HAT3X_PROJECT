import { describe, it, expect } from "vitest";
import { peorEstado, resumirServicio } from "@/lib/db/servicios-estado";

describe("estado de un servicio con varios checks", () => {
  it("un servicio sin checks está en desconocido", () => {
    expect(peorEstado([])).toBe("desconocido");
  });

  it("todos correctos: ok", () => {
    expect(peorEstado(["ok", "ok"])).toBe("ok");
  });

  it("manda el peor: un caído tiñe todo el servicio", () => {
    expect(peorEstado(["ok", "degradado", "caido"])).toBe("caido");
  });

  it("degradado gana a ok", () => {
    expect(peorEstado(["ok", "degradado"])).toBe("degradado");
  });

  it("desconocido no empeora a un caído real", () => {
    // Un check sin datos no debe rebajar un servicio que sabemos caído.
    expect(peorEstado(["caido", "desconocido"])).toBe("caido");
  });

  it("desconocido sí gana a ok: hay algo sin comprobar", () => {
    expect(peorEstado(["ok", "desconocido"])).toBe("desconocido");
  });

  it("desconocido no empeora a un degradado", () => {
    expect(peorEstado(["degradado", "desconocido"])).toBe("degradado");
  });
});

describe("resumen de servicio", () => {
  it("promedia el uptime de todos sus checks", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 100, ultimoError: null },
      { estado: "ok", uptime: 98, ultimoError: null },
    ]);
    expect(r.uptime30d).toBe(99);
  });

  it("ignora los checks sin datos al promediar", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 98, ultimoError: null },
      { estado: "desconocido", uptime: null, ultimoError: null },
    ]);
    expect(r.uptime30d).toBe(98);
  });

  it("sin ningún dato el uptime es null, no 0", () => {
    const r = resumirServicio([{ estado: "desconocido", uptime: null, ultimoError: null }]);
    expect(r.uptime30d).toBeNull();
  });

  it("un servicio sin checks queda en desconocido y sin uptime", () => {
    expect(resumirServicio([])).toEqual({
      estado: "desconocido",
      uptime30d: null,
      ultimoError: null,
    });
  });

  it("muestra el error del check en peor estado", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 100, ultimoError: null },
      { estado: "caido", uptime: 90, ultimoError: "HTTP 500" },
    ]);
    expect(r.estado).toBe("caido");
    expect(r.ultimoError).toBe("HTTP 500");
  });

  // Si el que está peor no dice por qué, no se enseña el error de otro check
  // que sí va bien: sería señalar al culpable equivocado.
  it("no coge el error de un check en mejor estado", () => {
    const r = resumirServicio([
      { estado: "degradado", uptime: 95, ultimoError: "lento" },
      { estado: "caido", uptime: 10, ultimoError: null },
    ]);
    expect(r.estado).toBe("caido");
    expect(r.ultimoError).toBeNull();
  });

  it("redondea el promedio a un decimal", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 99.9, ultimoError: null },
      { estado: "ok", uptime: 98.2, ultimoError: null },
    ]);
    expect(r.uptime30d).toBe(99.1);
  });
});
