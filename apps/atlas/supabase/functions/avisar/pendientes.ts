// COPIA de src/lib/alertas/pendientes.ts — NO editar aquí.
// Si cambias el original, vuelve a copiarlo.
// El test copias.test.ts falla si divergen.
//
// Qué incidencias hay que avisar, y con qué campo se sellan para que no
// vuelvan.
//
// Una incidencia avisa DOS veces en su vida: cuando se abre y cuando se cierra.
// Con un solo `notificada_en` la segunda no llegaba nunca — la fila seguía
// sellada de la primera. Por eso hay dos sellos, y por eso esto vive aparte con
// sus propias pruebas: es la clase de decisión que se rompe en silencio.
//
// Sin imports: esto corre también en Deno, dentro de la Edge Function.
//

export type Tipo = "apertura" | "recuperacion";

/** Qué campo hay que sellar. `ambos` cierra la fila de una vez. */
export type Sello = "apertura" | "recuperacion" | "ambos";

export type FilaPendiente = {
  id: string;
  abiertaEn: string;
  cerradaEn: string | null;
  notificadaEn: string | null;
  recuperacionNotificadaEn: string | null;
  silenciadaHasta: string | null;
};

export type Decision = {
  /** Qué se envía. `null` es «nada», que no siempre significa «nada que hacer». */
  tipo: Tipo | null;
  /** Qué se marca. Puede haber sello sin envío: es lo que hace el silencio. */
  sello: Sello | null;
};

/**
 * `infinity` es el «para siempre» de Postgres. No es una fecha, y compararlo
 * como tal da falso — justo lo contrario de lo que se pidió.
 */
function silenciada(hasta: string | null, ahora: string): boolean {
  if (hasta === null) return false;
  return hasta === "infinity" || hasta > ahora;
}

export function clasificar(fila: FilaPendiente, ahora: string): Decision {
  const callada = silenciada(fila.silenciadaHasta, ahora);

  if (fila.cerradaEn === null) {
    if (fila.notificadaEn !== null) return { tipo: null, sello: null };
    // Silenciada: se sella igual, para que no vuelva a mirarse. Lo que se calla
    // es el aviso, nunca el registro.
    return { tipo: callada ? null : "apertura", sello: "apertura" };
  }

  // Cerrada sin haber avisado nunca la apertura: se abrió y se cerró entre dos
  // pasadas, o estaba silenciada. Decir «ya funciona» de algo que nadie sabía
  // roto desconcierta más que informar. Se sellan los dos campos.
  if (fila.notificadaEn === null) return { tipo: null, sello: "ambos" };

  if (fila.recuperacionNotificadaEn !== null) return { tipo: null, sello: null };

  return { tipo: callada ? null : "recuperacion", sello: "recuperacion" };
}

/**
 * Agrupa los ids por el campo que hay que sellar, para cerrarlos con dos
 * `update … in (…)` en vez de uno por fila.
 */
export function repartirSellos(
  filas: FilaPendiente[],
  ahora: string
): { apertura: string[]; recuperacion: string[] } {
  const apertura: string[] = [];
  const recuperacion: string[] = [];

  for (const fila of filas) {
    const { sello } = clasificar(fila, ahora);
    if (sello === "apertura" || sello === "ambos") apertura.push(fila.id);
    if (sello === "recuperacion" || sello === "ambos") recuperacion.push(fila.id);
  }

  return { apertura, recuperacion };
}
