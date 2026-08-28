// Alarma de "pedido nuevo".
//  - En la APK (Capacitor) suena de forma NATIVA (fichero alarm.wav, fuerte y
//    fiable, sin las limitaciones del WebView).
//  - En navegador (web) cae a Web Audio.
import { Capacitor } from "@capacitor/core";
import { NativeAudio } from "@capacitor-community/native-audio";

const ASSET_ID = "alarm-pedido";
let preloadStarted = false;
let nativeReady = false;

async function ensureNativePreload(): Promise<boolean> {
  if (preloadStarted) return nativeReady;
  preloadStarted = true;
  try {
    await NativeAudio.preload({
      assetId: ASSET_ID,
      assetPath: "public/alarm.wav", // Capacitor copia /public a assets/public
      audioChannelNum: 1,
      isUrl: false,
      volume: 1.0,
    });
    nativeReady = true;
  } catch {
    nativeReady = false;
  }
  return nativeReady;
}

// ── Web Audio (respaldo para navegador) ─────────────────────────────────────
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function playWebBeep(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.ratio.value = 20; limiter.attack.value = 0.002;
  limiter.connect(c.destination);
  const now = c.currentTime;
  const dur = 0.13, gap = 0.07;
  for (let i = 0; i < 12; i++) {
    const freq = i % 2 === 0 ? 1320 : 990;
    const t = now + i * (dur + gap);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0, t + 0.006);
    g.gain.setValueAtTime(1.0, t + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(limiter);
    const osc = c.createOscillator();
    osc.type = "square"; osc.frequency.value = freq;
    osc.connect(g); osc.start(t); osc.stop(t + dur + 0.02);
  }
}

/** Prepara el audio tras un gesto del usuario (necesario en Android). */
export function unlockAudio(): void {
  if (Capacitor.isNativePlatform()) { ensureNativePreload(); return; }
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

/** Reproduce la alarma (nativa en APK, Web Audio en navegador). */
export function playBeep(): void {
  if (Capacitor.isNativePlatform()) {
    (async () => {
      const ok = await ensureNativePreload();
      if (ok) {
        try {
          await NativeAudio.stop({ assetId: ASSET_ID }).catch(() => {});
          await NativeAudio.play({ assetId: ASSET_ID });
          return;
        } catch {
          /* cae a web audio */
        }
      }
      playWebBeep();
    })();
    return;
  }
  playWebBeep();
}
