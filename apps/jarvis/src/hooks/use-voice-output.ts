'use client';
import { useState, useCallback, useRef } from 'react';

interface UseVoiceOutputReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

function browserSpeak(text: string, onDone: () => void): void {
  if (!('speechSynthesis' in window)) { onDone(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  u.rate = 1.05;
  u.onend = onDone;
  u.onerror = onDone;
  window.speechSynthesis.speak(u);
}

export function useVoiceOutput(
  onSpeakingChange?: (speaking: boolean) => void,
): UseVoiceOutputReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) { audioRef.current.src = ''; audioRef.current = null; }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  const speak = useCallback(async (text: string) => {
    stop();
    setIsSpeaking(true);
    onSpeakingChange?.(true);

    try {
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        // ElevenLabs unavailable (402 free plan, 500 error) → browser TTS fallback
        browserSpeak(text, () => { setIsSpeaking(false); onSpeakingChange?.(false); });
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        objectUrlRef.current = null;
        audioRef.current = null;
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      };
      audio.onerror = () => {
        browserSpeak(text, () => { setIsSpeaking(false); onSpeakingChange?.(false); });
      };
      await audio.play();
    } catch {
      browserSpeak(text, () => { setIsSpeaking(false); onSpeakingChange?.(false); });
    }
  }, [stop, onSpeakingChange]);

  return { isSpeaking, speak, stop };
}
