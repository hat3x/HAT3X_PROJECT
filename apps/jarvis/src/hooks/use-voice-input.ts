'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { VoiceState } from '@/types/jarvis';

interface UseVoiceInputReturn {
  voiceState: VoiceState;
  volume: number;
  startRecording: (deviceId?: string) => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  resetVoiceState: () => void;
  error: string | null;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);

  const stopVolumeTracking = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setVolume(0);
  }, []);

  const startVolumeTracking = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;
      setVolume(Math.round((avg / 128) * 100));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => stopVolumeTracking(), [stopVolumeTracking]);

  const startRecording = useCallback(async (deviceId?: string) => {
    setError(null);
    try {
      const audioConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      startVolumeTracking(stream);
      setVoiceState('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setVoiceState('idle');
    }
  }, [startVolumeTracking]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    stopVolumeTracking();
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') { resolve(null); return; }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        resolve(blob);
      };
      recorder.stop();
      setVoiceState('processing');
    });
  }, [stopVolumeTracking]);

  const resetVoiceState = useCallback(() => setVoiceState('idle'), []);

  return { voiceState, volume, startRecording, stopRecording, resetVoiceState, error };
}
