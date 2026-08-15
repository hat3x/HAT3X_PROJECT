//
// Decide a dónde mandar a cada visitante. Función pura: sin red, sin cookies,
// sin `Date.now()`. El middleware solo recoge el estado y aplica lo que diga.

export type Aal = "aal1" | "aal2";

export type EstadoSesion = {
  haySesion: boolean;
  /** Nivel alcanzado en esta sesión. */
  nivelActual: Aal | null;
  /** Nivel que la cuenta exige. Es 'aal2' cuando hay un factor dado de alta. */
  nivelExigido: Aal | null;
};

export const RUTAS_ABIERTAS = ["/login", "/alta-2fa", "/verificar"] as const;

export function decidirRuta(
  estado: EstadoSesion,
  rutaActual: string
): string | null {
  const { haySesion, nivelActual, nivelExigido } = estado;

  if (!haySesion) {
    return rutaActual === "/login" ? null : "/login";
  }

  // Segundo factor obligatorio: sin factor dado de alta no se entra a nada.
  if (nivelExigido === "aal1" && nivelActual === "aal1") {
    return rutaActual === "/alta-2fa" ? null : "/alta-2fa";
  }

  // Tiene factor, pero esta sesión aún no lo ha superado.
  if (nivelExigido === "aal2" && nivelActual === "aal1") {
    return rutaActual === "/verificar" ? null : "/verificar";
  }

  // Dentro del todo: las pantallas de entrada ya no tienen sentido.
  if ((RUTAS_ABIERTAS as readonly string[]).includes(rutaActual)) return "/";
  return null;
}
