/**
 * Alarma sonora persistente para avisar de "pedido listo".
 *
 * Realidad iOS Safari:
 *  - El audio web debe "desbloquearse" con un gesto del usuario (un toque).
 *    Por eso unlockAudio() debe llamarse DENTRO de un handler de click/touch.
 *  - Si el interruptor de silencio del iPhone está activado, iOS silencia
 *    TODO el audio web. No hay solución por web (de ahí la alarma visual).
 *  - Mientras la pestaña está en primer plano y el audio está desbloqueado,
 *    podemos sonar en bucle programáticamente.
 *
 * Mantenemos un único AudioContext compartido y vivo (no lo cerramos) para
 * que permanezca desbloqueado entre el gesto inicial y el momento del aviso.
 */

let ctx: AudioContext | null = null;
let loopId: number | null = null;

function getCtx(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  } catch {
    return null;
  }
}

/** Debe invocarse desde un gesto del usuario (click/touch) para desbloquear iOS. */
export function unlockAudio(): boolean {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === 'suspended') c.resume();
    // Blip casi inaudible para completar el desbloqueo en iOS.
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.05);
    return true;
  } catch {
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Alarma FUERTE y molesta: pitidos alternando agudo/grave con onda cuadrada
 *  (rica en armónicos = se percibe muy alta) a tope con limitador. */
function chime() {
  const c = ctx;
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  const now = c.currentTime;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.connect(c.destination);
  const dur = 0.14;
  const gap = 0.06;
  for (let i = 0; i < 8; i++) {
    const freq = i % 2 === 0 ? 1320 : 990;
    const t = now + i * (dur + gap);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0, t + 0.006);
    g.gain.setValueAtTime(1.0, t + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(limiter);
    [-6, 0, 6].forEach((det) => {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.detune.value = det;
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }
}

/** Vibración (solo Android; iOS Safari no soporta la Vibration API). */
function vibrate() {
  try {
    navigator.vibrate?.([500, 250, 500]);
  } catch {
    /* no soportado */
  }
}

/** Arranca la alarma en bucle (suena y vibra cada ~2s) hasta llamar a stopAlarm(). */
export function startAlarm() {
  // El sonido necesita audio desbloqueado; la vibración es independiente.
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    chime();
  }
  vibrate();
  if (loopId == null) {
    loopId = window.setInterval(() => {
      if (ctx) chime();
      vibrate();
    }, 2000);
  }
}

export function stopAlarm() {
  if (loopId != null) {
    window.clearInterval(loopId);
    loopId = null;
  }
  try {
    navigator.vibrate?.(0); // cancela cualquier vibración en curso
  } catch {
    /* no soportado */
  }
}
