/**
 * Traduce los errores de escritura de una ficha al idioma de la clínica.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Kristel intentó añadir un teléfono a una ficha y la pantalla le enseñó esto:
 *
 *   duplicate key value violates unique constraint "idx_customers_salon_phone_e164"
 *
 * Eso no es un mensaje de error, es el volcado de Postgres. Quien lo lee no
 * sabe qué ha pasado, ni con qué ficha choca, ni qué puede hacer.
 *
 * ── LO QUE NO SE HACE AQUÍ ──────────────────────────────────────────────────
 * Traducir SOLO lo que se reconoce. Un error desconocido se deja literal:
 * disfrazarlo de frase amable esconde el problema real a quien tenga que
 * arreglarlo, y encima le hace perder el tiempo buscándolo.
 */

/** Lo mínimo que se necesita de un error de PostgREST/Postgres. */
export interface PgLikeError {
  code?: string;
  message?: string;
}

export interface WriteErrorContext {
  /** Nombre de la ficha con la que choca, si se ha podido averiguar. */
  conflictingName?: string | null;
}

export function describeCustomerWriteError(
  error: PgLikeError | null | undefined,
  context: WriteErrorContext = {},
): string {
  const message = error?.message ?? "No se pudo guardar la ficha.";
  if (error?.code !== "23505") return message;

  // El teléfono. Es el que se topa a diario: en una familia el móvil de
  // contacto es el mismo para la madre y para los hijos.
  if (message.includes("idx_customers_salon_phone_e164")) {
    const quien = context.conflictingName?.trim();
    return quien
      ? `Ese teléfono ya está en la ficha de ${quien}. Si son la misma persona, únelas; ` +
        `si son familia y comparten móvil, de momento el sistema no lo admite — avísanos.`
      : "Ese teléfono ya está en otra ficha de la clínica. Si son la misma persona, únelas; " +
        "si son familia y comparten móvil, de momento el sistema no lo admite — avísanos.";
  }

  if (message.includes("idx_customers_salon_email")) {
    const quien = context.conflictingName?.trim();
    return quien
      ? `Ese correo ya está en la ficha de ${quien}.`
      : "Ese correo ya está en otra ficha de la clínica.";
  }

  return message;
}
