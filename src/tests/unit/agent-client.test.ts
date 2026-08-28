/**
 * Cliente del agente local, lado navegador (A1a).
 *
 * Lo que se prueba aquí no es la red: es la TRADUCCIÓN de lo que responde el
 * agente a algo que una recepcionista pueda resolver sola. Es la diferencia
 * entre "Failed to fetch" y "no encuentro el agente en este ordenador".
 *
 * Cada fallo tiene una causa distinta y una solución distinta:
 *   · no hay agente           → hay que instalarlo o arrancarlo
 *   · no emparejado (401)     → el token no coincide con el del panel
 *   · equipo desconocido (404)→ ese equipo no está dado de alta en ESTE PC
 *   · adaptador pendiente(501)→ TWAIN/DICOM todavía no
 *   · no llegó imagen (502)   → el equipo no guardó donde se le dijo
 * Mandarlas todas al mismo "ha fallado algo" haría que cada incidencia acabara
 * en una llamada de soporte.
 */
import { describe, it, expect } from "vitest";

import { AgentError, captureFromAgent, probeAgent } from "@/lib/imaging/agent-client";

const PETICION = {
  port: 7345,
  token: "a".repeat(32),
  deviceId: "11111111-1111-1111-1111-111111111111",
  customerId: "22222222-2222-2222-2222-222222222222",
  modality: "periapical",
  fdiCode: 46,
};

/** `fetch` falso que devuelve lo que se le diga. */
function fakeFetch(status: number, body: unknown) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

/** `fetch` falso que revienta, como cuando no hay nadie escuchando. */
const deadFetch = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

describe("probeAgent", () => {
  it("true cuando el agente contesta", async () => {
    const ok = await probeAgent(7345, fakeFetch(200, { ok: true, version: "0.1.0" }));
    expect(ok).toBe(true);
  });

  it("false cuando no hay nadie escuchando, sin lanzar", async () => {
    // La sonda se ejecuta al abrir la ficha: si lanzara, rompería la pantalla
    // en toda clínica que no tenga agente instalado, que son la mayoría.
    await expect(probeAgent(7345, deadFetch)).resolves.toBe(false);
  });
});

describe("captureFromAgent — traducción de fallos", () => {
  it("sin agente: dice que no lo encuentra, no 'Failed to fetch'", async () => {
    await expect(captureFromAgent(PETICION, deadFetch)).rejects.toThrow(AgentError);
    await expect(captureFromAgent(PETICION, deadFetch)).rejects.toThrow(/agente/i);
  });

  it("401: el problema es el emparejamiento, y lo dice", async () => {
    const call = captureFromAgent(PETICION, fakeFetch(401, { error: "no emparejado" }));
    await expect(call).rejects.toThrow(/emparejad/i);
  });

  it("404: ese equipo no está en este ordenador", async () => {
    const call = captureFromAgent(PETICION, fakeFetch(404, { error: "no configurado" }));
    await expect(call).rejects.toThrow(/ordenador/i);
  });

  it("501: adaptador todavía no disponible, con su mensaje", async () => {
    const call = captureFromAgent(
      PETICION,
      fakeFetch(501, { error: 'El adaptador "twain" todavía no está disponible.' }),
    );
    await expect(call).rejects.toThrow(/twain/i);
  });

  it("502: se propaga lo que dijo el agente, que sabe por qué falló", async () => {
    const call = captureFromAgent(
      PETICION,
      fakeFetch(502, { error: "No ha llegado ninguna imagen." }),
    );
    await expect(call).rejects.toThrow(/no ha llegado/i);
  });
});

describe("captureFromAgent — éxito", () => {
  it("devuelve los bytes decodificados y su tipo", async () => {
    const contenido = "esto-son-los-bytes-de-la-radiografia";
    const base64 = btoa(contenido);

    const imagen = await captureFromAgent(
      PETICION,
      fakeFetch(200, { filename: "rx-0002.jpg", mime: "image/jpeg", base64 }),
    );

    expect(imagen.filename).toBe("rx-0002.jpg");
    expect(imagen.mime).toBe("image/jpeg");
    expect(new TextDecoder().decode(imagen.bytes)).toBe(contenido);
  });

  it("rechaza una respuesta sin imagen aunque venga con 200", async () => {
    // Un 200 vacío significaría archivar una radiografía de cero bytes en la
    // ficha del paciente.
    const call = captureFromAgent(PETICION, fakeFetch(200, { filename: "x.jpg" }));
    await expect(call).rejects.toThrow(AgentError);
  });
});
