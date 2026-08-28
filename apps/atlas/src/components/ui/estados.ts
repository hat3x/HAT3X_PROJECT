import type { EstadoCheck } from "@/lib/incidencias/maquina";
import type { EstadoVisual } from "./Distintivo";

/**
 * El motor habla de estados y el distintivo de colores. Aquí se traduce, en un
 * solo sitio: tenerlo copiado en cada pantalla es como acaban divergiendo los
 * textos y apareciendo un «Caido» sin tilde en una esquina.
 */
export const TEXTO_ESTADO: Record<EstadoCheck, string> = {
  ok: "Operativo",
  degradado: "Degradado",
  caido: "Caído",
  desconocido: "Sin datos",
};

/** `degradado` se pinta como aviso: no es una caída, pero tampoco va bien. */
export const COLOR_ESTADO: Record<EstadoCheck, EstadoVisual> = {
  ok: "ok",
  degradado: "aviso",
  caido: "caido",
  desconocido: "desconocido",
};

/** El token CSS del color de estado, para pintar fondos y bordes. */
export const TOKEN_ESTADO: Record<EstadoCheck, string> = {
  ok: "var(--estado-ok)",
  degradado: "var(--estado-aviso)",
  caido: "var(--estado-caido)",
  desconocido: "var(--estado-desconocido)",
};
