'use client';
import { useState, useCallback, useRef } from 'react';

interface UseVoiceOutputReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
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
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  const speak = useCallback(async (text: string) => {
    stop();
    try {
      setIsSpeaking(true);
      onSpeakingChange?.(true);

      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`speak API error ${response.status}`);

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
      audio.onerror = () => { setIsSpeaking(false); onSpeakingChange?.(false); };
      await audio.play();
    } catch (err) {
      console.error('[useVoiceOutput]', err);
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    }
  }, [stop, onSpeakingChange]);

  return { isSpeaking, speak, stop };
}
