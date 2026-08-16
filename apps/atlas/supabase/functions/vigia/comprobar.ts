//
// Ejecuta un check. Recibe `fetch` como parámetro para poder probarlo sin red.
// Sin dependencias de Node ni de Deno: código estándar que corre en ambos.
//
import { evaluarHttp } from "./evaluar.ts";

export type ResultadoCheck = {
  ok: boolean;
  latenciaMs: number | null;
  statusCode: number | null;
  error: string | null;
};

export type DefinicionCheck = {
  id: string;
  servicioId: string;
  tipo: "http" | "ssl" | "dns" | "tcp";
  url: string | null;
  metodo: string;
  cabeceras: Record<string, string> | null;
  cuerpo: string | null;
  esperaStatus: number[];
  esperaTexto: string | null;
  timeoutMs: number;
};

export async function comprobar(
  def: DefinicionCheck,
  buscar: typeof fetch
): Promise<ResultadoCheck> {
  if (!def.url) {
    // Distinto de una caída: el servicio puede estar perfectamente y ser Atlas
    // quien está mal configurado. El mensaje lo deja claro.
    return {
      ok: false,
      latenciaMs: null,
      statusCode: null,
      error: "El check no tiene URL configurada",
    };
  }

  const abortador = new AbortController();
  const temporizador = setTimeout(() => abortador.abort(), def.timeoutMs);
  const inicio = performance.now();

  try {
    const respuesta = await buscar(def.url, {
      method: def.metodo,
      headers: def.cabeceras ?? undefined,
      body: def.cuerpo ?? undefined,
      signal: abortador.signal,
      redirect: "follow",
    });
    const latenciaMs = Math.round(performance.now() - inicio);

    // Solo se lee el cuerpo si hace falta comprobar un texto: descargar
    // megabytes de HTML cada cinco minutos, por doce proyectos, no es gratis.
    const cuerpo = def.esperaTexto !== null ? await respuesta.text() : "";

    const veredicto = evaluarHttp(
      { statusCode: respuesta.status, cuerpo },
      { esperaStatus: def.esperaStatus, esperaTexto: def.esperaTexto }
    );

    return {
      ok: veredicto.ok,
      latenciaMs,
      statusCode: respuesta.status,
      error: veredicto.error,
    };
  } catch (e: unknown) {
    const esAborto = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      latenciaMs: null,
      statusCode: null,
      error: esAborto
        ? `Tiempo de espera agotado (${def.timeoutMs} ms)`
        : `Error de red: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(temporizador);
  }
}
