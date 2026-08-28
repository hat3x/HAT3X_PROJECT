import { describe, it, expect } from "vitest";
import {
  comprobar,
  type DefinicionCheck,
} from "../../../supabase/functions/vigia/comprobar";

function def(parcial: Partial<DefinicionCheck> = {}): DefinicionCheck {
  return {
    id: "c1",
    servicioId: "s1",
    tipo: "http",
    url: "https://ejemplo.test/salud",
    metodo: "GET",
    cabeceras: null,
    cuerpo: null,
    esperaStatus: [200],
    esperaTexto: null,
    timeoutMs: 5000,
    ...parcial,
  };
}

describe("comprobación HTTP", () => {
  it("una respuesta correcta da ok, con su latencia", async () => {
    const falso: typeof fetch = async () => new Response("todo bien", { status: 200 });
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.latenciaMs).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeNull();
  });

  it("un 500 da fallo, con el código en el error", async () => {
    const falso: typeof fetch = async () => new Response("", { status: 500 });
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(500);
    expect(r.error).toBe("HTTP 500 (se esperaba 200)");
  });

  it("un 200 sin el texto esperado también es fallo", async () => {
    const falso: typeof fetch = async () =>
      new Response("<h1>Application error</h1>", { status: 200 });
    const r = await comprobar(def({ esperaTexto: "Reservar cita" }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La respuesta no contiene «Reservar cita»");
  });

  it("un fallo de red se recoge como error, no revienta", async () => {
    const falso: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBeNull();
    expect(r.error).toContain("fetch failed");
  });

  it("un timeout se distingue de cualquier otro error", async () => {
    const falso: typeof fetch = async (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener("abort", () =>
          rechazar(new DOMException("The operation was aborted.", "AbortError"))
        );
      });
    const r = await comprobar(def({ timeoutMs: 50 }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Tiempo de espera agotado (50 ms)");
  });

  it("un check http sin URL es un error de configuración, no una caída", async () => {
    const falso: typeof fetch = async () => new Response("", { status: 200 });
    const r = await comprobar(def({ url: null }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("El check no tiene URL configurada");
  });

  it("envía el método y las cabeceras configurados", async () => {
    let visto: { metodo?: string; cabecera?: string | null } = {};
    const falso: typeof fetch = async (_url, init) => {
      visto = {
        metodo: init?.method,
        cabecera: new Headers(init?.headers).get("x-atlas"),
      };
      return new Response("", { status: 200 });
    };
    await comprobar(def({ metodo: "POST", cabeceras: { "x-atlas": "1" } }), falso);
    expect(visto.metodo).toBe("POST");
    expect(visto.cabecera).toBe("1");
  });

  // Descargar megabytes de HTML cada pocos minutos, por doce proyectos, no es
  // gratis: si nadie va a mirar el texto, el cuerpo ni se lee.
  it("no lee el cuerpo si no hay texto que comprobar", async () => {
    let leido = false;
    const falso: typeof fetch = async () => {
      const r = new Response("payload enorme", { status: 200 });
      const original = r.text.bind(r);
      r.text = async () => {
        leido = true;
        return original();
      };
      return r;
    };
    await comprobar(def({ esperaTexto: null }), falso);
    expect(leido).toBe(false);
  });

  it("sí lo lee cuando hay texto que comprobar", async () => {
    const falso: typeof fetch = async () =>
      new Response("<button>Reservar cita</button>", { status: 200 });
    const r = await comprobar(def({ esperaTexto: "Reservar cita" }), falso);
    expect(r.ok).toBe(true);
  });
});
