import { describe, it, expect, vi } from "vitest";
import { leerCenso } from "@/lib/descubrir/kairos";

const URL = "https://kairos.ejemplo.test";
const CLAVE = "clave-de-prueba";

const respuesta = (cuerpo: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) }) as Response;

describe("leer el censo de Kairos", () => {
  it("devuelve los tenants y los normaliza", async () => {
    const falso = vi.fn(async (_u: string, _o: RequestInit) =>
      respuesta([
        { slug: "uno", name: "Salón Uno", sector: "peluqueria" },
        { slug: "dos", name: "Clínica Dos", sector: "odontologia" },
      ])
    );

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tenants).toEqual([
      { slug: "uno", nombre: "Salón Uno", sector: "peluqueria" },
      { slug: "dos", nombre: "Clínica Dos", sector: "odontologia" },
    ]);
  });

  it("llama a la RPC con la clave en las dos cabeceras que pide PostgREST", async () => {
    const falso = vi.fn(async (_u: string, _o: RequestInit) => respuesta([]));

    await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);

    const [url, opciones] = falso.mock.calls[0]!;
    expect(url).toBe(`${URL}/rest/v1/rpc/atlas_list_salons`);
    expect(opciones.method).toBe("POST");
    const cab = opciones.headers as Record<string, string>;
    expect(cab.apikey).toBe(CLAVE);
    expect(cab.Authorization).toBe(`Bearer ${CLAVE}`);
  });

  // Que la RPC no exista todavía es el estado de hoy, y tiene que distinguirse
  // de «no hay tenants»: uno es un fallo y el otro es un dato.
  it("un 404 es un error, no un censo vacío", async () => {
    const falso = vi.fn(async () => respuesta({ message: "not found" }, false, 404));

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/404/);
  });

  it("un 401 avisa de que la clave no vale", async () => {
    const falso = vi.fn(async () => respuesta({ message: "no" }, false, 401));

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });

  // Si un proxy devuelve HTML de error, JSON.parse da algo que no es una lista.
  // Tragárselo como censo vacío sería peor que fallar: el reconciliador se fía
  // de que un censo vacío significa «no toques nada».
  it("lo que no sea una lista es un error", async () => {
    const falso = vi.fn(async () => respuesta({ error: "algo" }));

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });

  it("una fila sin slug invalida la respuesta entera", async () => {
    const falso = vi.fn(async () =>
      respuesta([{ slug: "uno", name: "Uno", sector: "peluqueria" }, { name: "Sin slug" }])
    );

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });

  it("una lista vacía SÍ es un censo válido: cero tenants activos", async () => {
    const falso = vi.fn(async () => respuesta([]));

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tenants).toEqual([]);
  });

  it("si la red falla no revienta, devuelve el motivo", async () => {
    const falso = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const r = await leerCenso(URL, CLAVE, falso as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ECONNREFUSED/);
  });

  it("sin URL o sin clave ni lo intenta", async () => {
    const falso = vi.fn(async () => respuesta([]));

    expect((await leerCenso("", CLAVE, falso as unknown as typeof fetch)).ok).toBe(false);
    expect((await leerCenso(URL, "", falso as unknown as typeof fetch)).ok).toBe(false);
    expect(falso).not.toHaveBeenCalled();
  });
});
