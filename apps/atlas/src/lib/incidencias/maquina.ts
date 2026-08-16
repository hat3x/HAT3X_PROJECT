//
// Decide qué hacer con el resultado de un check. Lógica pura: sin red, sin base
// de datos, sin reloj del sistema. Es lo que hace que Atlas sea útil en lugar de
// insoportable, así que es también lo más probado del proyecto.
//
// No importa NADA: la Edge Function «vigía» (Tarea 4) la reutiliza y corre
// sobre Deno, donde no existen los módulos de Node.
//

export type EstadoCheck = "ok" | "degradado" | "caido" | "desconocido";

export type ResultadoCheck = {
  ok: boolean;
  latenciaMs: number | null;
  statusCode: number | null;
  error: string | null;
};

export type Contexto = {
  estadoActual: EstadoCheck;
  fallosConsecutivos: number;
  /** Fallos seguidos necesarios para dar el servicio por caído. */
  umbralFallos: number;
  /** Por encima de esta latencia se considera degradado. null = no se mira. */
  umbralLatenciaMs: number | null;
  incidenciaAbierta: boolean;
  /** Ventana de mantenimiento activa o incidencia silenciada. */
  silenciado: boolean;
  /** Ajuste del propio check: si es false, nunca notifica. */
  notifica: boolean;
};

export type Transicion = {
  estadoNuevo: EstadoCheck;
  fallosConsecutivos: number;
  abrirIncidencia: boolean;
  cerrarIncidencia: boolean;
  notificar: "apertura" | "recuperacion" | null;
};

/**
 * El estado intermedio «fallando» del diagrama del spec NO se persiste: los
 * únicos estados en la base son ok, degradado, caido y desconocido. Un check que
 * ha fallado una o dos veces sin llegar al umbral se representa como
 * `degradado`, que es exactamente lo que significa —algo no va bien, pero no es
 * para despertarte— y evita que la pantalla diga «operativo» sobre un servicio
 * que lleva dos fallos seguidos.
 */
export function transicion(resultado: ResultadoCheck, ctx: Contexto): Transicion {
  // Silenciado o con las notificaciones apagadas: todo se registra igual, pero
  // no sale ningún aviso. El histórico nunca miente.
  const puedeAvisar = ctx.notifica && !ctx.silenciado;

  if (resultado.ok) {
    const lento =
      ctx.umbralLatenciaMs !== null &&
      resultado.latenciaMs !== null &&
      resultado.latenciaMs > ctx.umbralLatenciaMs;

    const cerrar = ctx.incidenciaAbierta;
    return {
      estadoNuevo: lento ? "degradado" : "ok",
      fallosConsecutivos: 0,
      abrirIncidencia: false,
      cerrarIncidencia: cerrar,
      notificar: cerrar && puedeAvisar ? "recuperacion" : null,
    };
  }

  const fallos = ctx.fallosConsecutivos + 1;
  const alcanzaUmbral = fallos >= ctx.umbralFallos;

  // Solo se abre cuando se cruza el umbral Y no había ya una incidencia viva.
  // Sin esta segunda condición, un servicio caído abriría una incidencia nueva
  // en cada comprobación.
  const abrir = alcanzaUmbral && !ctx.incidenciaAbierta;

  return {
    estadoNuevo: alcanzaUmbral ? "caido" : "degradado",
    fallosConsecutivos: fallos,
    abrirIncidencia: abrir,
    cerrarIncidencia: false,
    notificar: abrir && puedeAvisar ? "apertura" : null,
  };
}
