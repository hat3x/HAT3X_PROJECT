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

/**
 * Rutas que el guardia NO toca, ni con sesión ni sin ella.
 *
 * No son lo mismo que las abiertas: a una ruta abierta se llega sin sesión,
 * pero con la sesión hecha rebota a «/» porque es una pantalla de entrada que
 * ya no pinta nada. Estas no son pantallas, son endpoints, y rebotarlas las
 * rompería igual en los dos casos.
 *
 * `/api/silenciar` se pulsa desde una notificación del sistema, a veces con la
 * app cerrada. Su autorización es la firma del token, no la cookie.
 *
 * `/api/descubrir` la despierta pg_cron a través de pg_net, que no manda cookie
 * ninguna. Rebotarla a /login le devolvería un 307 y la reconciliación no
 * ocurriría nunca, sin ruido, porque pg_net no se lo cuenta a nadie. Su
 * autorización es ATLAS_CRON_KEY.
 *
 * «Públicas» no quiere decir abiertas: quiere decir que quien las autoriza no es
 * la cookie. Las dos comprueban su propia credencial antes de tocar nada.
 */
export const RUTAS_PUBLICAS = ["/api/silenciar", "/api/descubrir"] as const;

export function decidirRuta(estado: EstadoSesion, rutaActual: string): string | null {
  if ((RUTAS_PUBLICAS as readonly string[]).includes(rutaActual)) return null;

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
