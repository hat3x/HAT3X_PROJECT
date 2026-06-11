/**
 * Plays a bell/chime sound using Web Audio API.
 * Synthesized on the fly — no audio file needed.
 *
 * Note: On iOS, if the physical silent switch is ON, no web audio can play.
 * This is an OS-level restriction. On Android and desktop, it will play
 * regardless of media volume settings (uses the system/ringer channel).
 */
export async function playBellSound(volume = 0.6) {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    // iOS requires resume after user gesture
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    // Bell-like sound: two harmonics that decay
    const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain * volume, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Two-tone "ding-dong" bell (classic service bell)
    // First chime: high bright tone
    playTone(1318.51, now, 1.5, 0.4);          // E6 fundamental
    playTone(2637.02, now, 1.2, 0.15);         // E7 harmonic
    playTone(3951.07, now, 0.8, 0.08);         // B7 sparkle

    // Second chime slightly lower (ding-dong effect)
    playTone(987.77, now + 0.35, 1.5, 0.4);    // B5 fundamental
    playTone(1975.53, now + 0.35, 1.2, 0.15);  // B6 harmonic
    playTone(2959.96, now + 0.35, 0.8, 0.08);  // F#7 sparkle

    // Auto-close context after sound finishes to free resources
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 2500);
  } catch (err) {
    console.warn('Could not play bell sound:', err);
  }
}
