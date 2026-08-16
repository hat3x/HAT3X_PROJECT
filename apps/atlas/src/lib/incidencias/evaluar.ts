//
// Decide si una respuesta cuenta como buena. Separado del fetch a propósito:
// así se prueban todos los casos sin levantar ningún servidor.
//
// Como `maquina.ts`, no importa nada: la Edge Function «vigía» lo reutiliza
// sobre Deno.
//

export type Esperado = {
  esperaStatus: number[];
  esperaTexto: string | null;
};

export type Respuesta = {
  statusCode: number;
  cuerpo: string;
};

export type Veredicto = { ok: boolean; error: string | null };

export function evaluarHttp(respuesta: Respuesta, esperado: Esperado): Veredicto {
  const { statusCode, cuerpo } = respuesta;

  if (esperado.esperaStatus.length > 0) {
    if (!esperado.esperaStatus.includes(statusCode)) {
      return {
        ok: false,
        error: `HTTP ${statusCode} (se esperaba ${esperado.esperaStatus.join(" o ")})`,
      };
    }
  } else if (statusCode < 200 || statusCode >= 300) {
    return { ok: false, error: `HTTP ${statusCode} (se esperaba 2xx)` };
  }

  // El código correcto no basta: una aplicación rota devuelve 200 con una página
  // de error. Esto es lo que distingue «responde» de «funciona».
  if (esperado.esperaTexto !== null && !cuerpo.includes(esperado.esperaTexto)) {
    return { ok: false, error: `La respuesta no contiene «${esperado.esperaTexto}»` };
  }

  return { ok: true, error: null };
}

/**
 * Los días restantes llegan ya calculados: esta función no mira el reloj, igual
 * que el resto del módulo.
 */
export function evaluarCaducidad(diasRestantes: number, umbralDias: number): Veredicto {
  if (diasRestantes <= 0) return { ok: false, error: "Ya ha caducado" };
  if (diasRestantes >= umbralDias) return { ok: true, error: null };
  const plural = diasRestantes === 1 ? "día" : "días";
  return { ok: false, error: `Caduca en ${diasRestantes} ${plural}` };
}
