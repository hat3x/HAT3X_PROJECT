'use client';
import { useState, useCallback, useId } from 'react';
import { JarvisOrb } from '@/components/jarvis-orb';
import { VoiceButton } from '@/components/voice-button';
import { Transcript } from '@/components/transcript';
import { CommandLog } from '@/components/command-log';
import { FinanceBadge } from '@/components/finance-badge';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useVoiceOutput } from '@/hooks/use-voice-output';
import type { CommandEntry, CommandAction, VoiceState } from '@/types/jarvis';

export default function JarvisPage() {
  const idPrefix = useId();
  const [commandLog, setCommandLog] = useState<CommandEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentAction, setCurrentAction] = useState<CommandAction | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeakingOverride, setIsSpeakingOverride] = useState(false);

  const { voiceState, startRecording, stopRecording, error } = useVoiceInput();
  const { speak } = useVoiceOutput((speaking) => setIsSpeakingOverride(speaking));

  const effectiveState: VoiceState = isSpeakingOverride ? 'speaking' : voiceState;

  const handlePressStart = useCallback(async () => {
    setCurrentUserText('');
    setCurrentResponse('');
    setCurrentAction(undefined);
    await startRecording();
  }, [startRecording]);

  const handlePressEnd = useCallback(async () => {
    const blob = await stopRecording();
    if (!blob || blob.size < 1000) { return; }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const { text } = await transcribeRes.json() as { text: string };
      setCurrentUserText(text);

      const commandRes = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const { response, action } = await commandRes.json() as { response: string; action?: CommandAction };
      setCurrentResponse(response);
      setCurrentAction(action);
      setIsLoading(false);

      await speak(response);

      setCommandLog((prev) => [
        ...prev,
        { id: `${idPrefix}-${Date.now()}`, userText: text, jarvisResponse: response, timestamp: new Date() },
      ]);
    } catch (err) {
      console.error('[JarvisPage]', err);
      setCurrentResponse('Error al procesar el comando.');
      setIsLoading(false);
    }
  }, [stopRecording, speak, idPrefix]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-between px-6 py-12 bg-jarvis-bg">
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
        <VoiceButton
          voiceState={effectiveState}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
          disabled={isLoading}
        />
      </div>

      <CommandLog entries={commandLog} />
    </main>
  );
}
