import { describe, it, expect } from "vitest";
import { evaluarHttp, evaluarCaducidad } from "@/lib/incidencias/evaluar";

describe("evaluación HTTP", () => {
  it("acepta el código esperado", () => {
    expect(
      evaluarHttp(
        { statusCode: 200, cuerpo: "" },
        { esperaStatus: [200], esperaTexto: null }
      )
    ).toEqual({ ok: true, error: null });
  });

  it("acepta cualquiera de los códigos de la lista", () => {
    const esperado = { esperaStatus: [200, 204, 301], esperaTexto: null };
    for (const statusCode of [200, 204, 301]) {
      expect(evaluarHttp({ statusCode, cuerpo: "" }, esperado).ok, String(statusCode)).toBe(
        true
      );
    }
  });

  it("rechaza un código fuera de la lista, diciendo cuál llegó", () => {
    const r = evaluarHttp(
      { statusCode: 500, cuerpo: "" },
      { esperaStatus: [200], esperaTexto: null }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 500 (se esperaba 200)");
  });

  it("enumera todos los códigos admitidos en el error", () => {
    const r = evaluarHttp(
      { statusCode: 500, cuerpo: "" },
      { esperaStatus: [200, 204], esperaTexto: null }
    );
    expect(r.error).toBe("HTTP 500 (se esperaba 200 o 204)");
  });

  it("una web rota puede devolver 200: por eso existe el texto esperado", () => {
    const r = evaluarHttp(
      { statusCode: 200, cuerpo: "<h1>Application error</h1>" },
      { esperaStatus: [200], esperaTexto: "Reservar cita" }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La respuesta no contiene «Reservar cita»");
  });

  it("acepta cuando el texto esperado sí aparece", () => {
    expect(
      evaluarHttp(
        { statusCode: 200, cuerpo: "<button>Reservar cita</button>" },
        { esperaStatus: [200], esperaTexto: "Reservar cita" }
      )
    ).toEqual({ ok: true, error: null });
  });

  it("el código manda sobre el texto: si el código falla, ese es el error", () => {
    const r = evaluarHttp(
      { statusCode: 503, cuerpo: "" },
      { esperaStatus: [200], esperaTexto: "Reservar cita" }
    );
    expect(r.error).toBe("HTTP 503 (se esperaba 200)");
  });

  it("sin lista de códigos esperados, acepta cualquier 2xx", () => {
    expect(
      evaluarHttp({ statusCode: 204, cuerpo: "" }, { esperaStatus: [], esperaTexto: null })
        .ok
    ).toBe(true);
    expect(
      evaluarHttp({ statusCode: 404, cuerpo: "" }, { esperaStatus: [], esperaTexto: null })
        .ok
    ).toBe(false);
  });

  it("sin lista, un 3xx tampoco cuela: redirigir no es responder", () => {
    const r = evaluarHttp(
      { statusCode: 301, cuerpo: "" },
      { esperaStatus: [], esperaTexto: null }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 301 (se esperaba 2xx)");
  });

  it("sin lista pero con texto, sigue comprobando el texto", () => {
    const r = evaluarHttp(
      { statusCode: 200, cuerpo: "vacío" },
      { esperaStatus: [], esperaTexto: "Reservar cita" }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La respuesta no contiene «Reservar cita»");
  });
});

describe("evaluación de caducidad", () => {
  it("con margen de sobra está bien", () => {
    expect(evaluarCaducidad(214, 30)).toEqual({ ok: true, error: null });
  });

  it("por debajo del umbral avisa, diciendo cuántos días quedan", () => {
    const r = evaluarCaducidad(12, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Caduca en 12 días");
  });

  it("justo en el umbral todavía está bien", () => {
    expect(evaluarCaducidad(30, 30).ok).toBe(true);
  });

  it("ya caducado lo dice, sin días negativos", () => {
    expect(evaluarCaducidad(0, 30).error).toBe("Ya ha caducado");
    expect(evaluarCaducidad(-5, 30).error).toBe("Ya ha caducado");
  });

  it("queda un solo día: singular", () => {
    expect(evaluarCaducidad(1, 30).error).toBe("Caduca en 1 día");
  });
});
