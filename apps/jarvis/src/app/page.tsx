'use client';
import { useState, useCallback, useId, useEffect, useRef } from 'react';
import { JarvisOrb } from '@/components/jarvis-orb';
import { VoiceButton } from '@/components/voice-button';
import { Transcript } from '@/components/transcript';
import { CommandLog } from '@/components/command-log';
import { FinanceBadge } from '@/components/finance-badge';
import { MicConfig } from '@/components/mic-config';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useVoiceOutput } from '@/hooks/use-voice-output';
import type { CommandEntry, CommandAction, VoiceState } from '@/types/jarvis';

const VAD_THRESHOLD = 15;   // volume % above which = speech detected
const VAD_SILENCE_MS = 2500; // ms of silence after speech to trigger processing
const VAD_MIN_SPEECH_MS = 600; // minimum speech duration to avoid noise triggers

export default function JarvisPage() {
  const idPrefix = useId();
  const [commandLog, setCommandLog] = useState<CommandEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentAction, setCurrentAction] = useState<CommandAction | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeakingOverride, setIsSpeakingOverride] = useState(false);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>();
  const [isAutoMode, setIsAutoMode] = useState(false);

  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartTimeRef = useRef<number>(0);
  const speechDetectedRef = useRef(false);
  const isProcessingRef = useRef(false); // prevent double-trigger during auto mode

  const { voiceState, volume, startRecording, stopRecording, resetVoiceState, error } = useVoiceInput();
  const { speak } = useVoiceOutput((speaking) => setIsSpeakingOverride(speaking));

  const effectiveState: VoiceState = isSpeakingOverride ? 'speaking' : voiceState;

  const processAudio = useCallback(async (blob: Blob) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const transcribeData = await transcribeRes.json() as { text?: string; error?: string };
      if (!transcribeRes.ok || !transcribeData.text) {
        const msg = 'No te he entendido, Jota. Habla más cerca del micrófono e inténtalo de nuevo.';
        setCurrentResponse(msg);
        setIsLoading(false);
        void speak(msg);
        return;
      }
      const text = transcribeData.text.trim();
      if (!text) {
        const msg = 'No te he entendido, Jota. Habla más cerca del micrófono e inténtalo de nuevo.';
        setCurrentResponse(msg);
        setIsLoading(false);
        void speak(msg);
        return;
      }
      setCurrentUserText(text);

      const commandRes = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const commandData = await commandRes.json() as { response?: string; action?: CommandAction; error?: string };
      if (!commandRes.ok || !commandData.response) {
        const msg = commandData.error ?? 'Ha habido un error procesando tu petición, Jota. Inténtalo de nuevo.';
        setCurrentResponse(msg);
        setIsLoading(false);
        void speak(msg);
        return;
      }
      setCurrentResponse(commandData.response);
      setCurrentAction(commandData.action);
      setIsLoading(false);

      await speak(commandData.response);

      setCommandLog((prev) => [
        ...prev,
        { id: `${idPrefix}-${Date.now()}`, userText: text, jarvisResponse: commandData.response!, timestamp: new Date() },
      ]);
    } catch (err) {
      console.error('[JarvisPage]', err);
      setCurrentResponse(err instanceof Error ? err.message : 'Error al procesar el comando.');
      setIsLoading(false);
    } finally {
      resetVoiceState();
      isProcessingRef.current = false;
    }
  }, [speak, idPrefix, resetVoiceState]);

  // Push-to-talk handlers
  const handlePressStart = useCallback(async () => {
    if (isAutoMode) return;
    setCurrentUserText('');
    setCurrentResponse('');
    setCurrentAction(undefined);
    await startRecording(selectedMicId);
  }, [startRecording, selectedMicId, isAutoMode]);

  const handlePressEnd = useCallback(async () => {
    if (isAutoMode) return;
    const blob = await stopRecording();
    if (!blob || blob.size < 100) { resetVoiceState(); return; }
    await processAudio(blob);
  }, [stopRecording, resetVoiceState, processAudio, isAutoMode]);

  // VAD: watch volume while listening in auto mode
  useEffect(() => {
    if (!isAutoMode || voiceState !== 'listening' || isSpeakingOverride) return;

    if (volume >= VAD_THRESHOLD) {
      if (!speechDetectedRef.current) {
        speechDetectedRef.current = true;
        speechStartTimeRef.current = Date.now();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    } else if (speechDetectedRef.current && !silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(async () => {
        silenceTimerRef.current = null;
        const speechDuration = Date.now() - speechStartTimeRef.current;
        speechDetectedRef.current = false;

        if (speechDuration < VAD_MIN_SPEECH_MS) return;

        const blob = await stopRecording();
        if (!blob || blob.size < 100) { resetVoiceState(); return; }
        await processAudio(blob);
      }, VAD_SILENCE_MS);
    }
  }, [volume, voiceState, isSpeakingOverride, isAutoMode, stopRecording, resetVoiceState, processAudio]);

  // Auto-restart microphone after each turn in auto mode
  useEffect(() => {
    if (!isAutoMode) return;
    if (voiceState === 'idle' && !isSpeakingOverride && !isLoading && !isProcessingRef.current) {
      setCurrentUserText('');
      setCurrentResponse('');
      setCurrentAction(undefined);
      speechDetectedRef.current = false;
      startRecording(selectedMicId);
    }
  }, [isAutoMode, voiceState, isSpeakingOverride, isLoading, startRecording, selectedMicId]);

  const toggleAutoMode = useCallback(async () => {
    if (isAutoMode) {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      speechDetectedRef.current = false;
      setIsAutoMode(false);
      if (voiceState === 'listening') {
        await stopRecording();
        resetVoiceState();
      }
    } else {
      setCurrentUserText('');
      setCurrentResponse('');
      setCurrentAction(undefined);
      setIsAutoMode(true);
    }
  }, [isAutoMode, voiceState, stopRecording, resetVoiceState]);

  return (
    <main className="relative min-h-dvh flex flex-col items-center justify-between px-6 py-12 bg-jarvis-bg jarvis-bg-space overflow-hidden">
      {/* Floating micro-particles */}
      <div className="particle particle-1" />
      <div className="particle particle-2" />
      <div className="particle particle-3" />
      <div className="particle particle-4" />
      <div className="particle particle-5" />
      <div className="particle particle-6" />
      <div className="w-full max-w-lg flex items-center justify-between">
        <span className="text-jarvis-muted text-xs font-mono uppercase tracking-widest">HAT3X</span>
        <span className="text-jarvis-muted text-xs font-mono">
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div className="flex flex-col items-center gap-8">
        <JarvisOrb state={effectiveState} />
        <Transcript userText={currentUserText} jarvisResponse={currentResponse} isLoading={isLoading} />
        {currentAction && <FinanceBadge action={currentAction} />}
        {error && <p className="text-red-400 text-xs text-center max-w-xs">{error}</p>}

        {isAutoMode ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className={[
                'w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all duration-300',
                effectiveState === 'listening' && speechDetectedRef.current
                  ? 'bg-violet-600 scale-110 shadow-lg shadow-violet-500/50 ring-4 ring-violet-400/40'
                  : effectiveState === 'speaking'
                  ? 'bg-emerald-700 scale-105'
                  : effectiveState === 'processing' || isLoading
                  ? 'bg-jarvis-surface border border-violet-600/50 animate-pulse'
                  : 'bg-jarvis-surface border border-jarvis-border',
              ].join(' ')}
            >
              {effectiveState === 'speaking' ? '🔊' : effectiveState === 'processing' || isLoading ? '⏳' : '👂'}
            </div>
            <span className="text-jarvis-muted text-xs font-mono">
              {effectiveState === 'speaking' ? 'Jarvis responde...' : effectiveState === 'processing' || isLoading ? 'procesando...' : 'escuchando...'}
            </span>
            <button
              onClick={toggleAutoMode}
              className="text-xs font-mono px-3 py-1.5 rounded border border-violet-600/50 text-violet-400 hover:bg-violet-600/10 transition-colors"
            >
              detener
            </button>
          </div>
        ) : (
          <VoiceButton
            voiceState={effectiveState}
            onPressStart={handlePressStart}
            onPressEnd={handlePressEnd}
            disabled={isLoading}
          />
        )}

        <div className="flex flex-col items-center gap-2">
          {!isAutoMode && (
            <button
              onClick={toggleAutoMode}
              className="text-xs font-mono px-3 py-1.5 rounded border border-jarvis-border text-jarvis-muted hover:border-violet-600/50 hover:text-violet-400 transition-colors"
            >
              modo continuo
            </button>
          )}
          <MicConfig
            deviceId={selectedMicId}
            onDeviceChange={setSelectedMicId}
            volume={volume}
            isListening={effectiveState === 'listening'}
          />
        </div>
      </div>

      <CommandLog entries={commandLog} />
    </main>
  );
}
