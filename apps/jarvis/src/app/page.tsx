'use client';

import { useState, useCallback, useId, useEffect, useRef } from 'react';
import Link from 'next/link';
import { JarvisOrb } from '@/components/jarvis-orb';
import { VoiceButton } from '@/components/voice-button';
import { Transcript } from '@/components/transcript';
import { MicConfig } from '@/components/mic-config';
import { TextCommandInput } from '@/components/text-command-input';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useVoiceOutput } from '@/hooks/use-voice-output';
import { getCRMKPIs, type CRMKPIs } from '@/lib/crm';
import { fetchTasks, fetchRecentEvents, fetchCheckpoints, type HatTask, type BusEvent, type HatCheckpoint } from '@/lib/supabase-command';
import type { CommandEntry, CommandAction, VoiceState } from '@/types/jarvis';

const VAD_THRESHOLD     = 15;
const VAD_SILENCE_MS    = 2500;
const VAD_MIN_SPEECH_MS = 600;

const STATUS_COLOR: Record<string, string> = {
  running: '#10b981', pending: '#f59e0b', completed: '#3b82f6',
  failed: '#ef4444', paused: '#8b5cf6',
};

const EVENT_ICON: Record<string, string> = {
  'task.started': '▶', 'task.completed': '✓', 'task.failed': '✗',
  'checkpoint.triggered': '◆', 'checkpoint.approved': '✓',
  'agent.online': '◉', 'phase.started': '→', 'phase.completed': '→',
};

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return `${Math.floor(d / 1000)}s`;
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return `${Math.floor(d / 86400000)}d`;
}

// ─── KPI bar ──────────────────────────────────────────────────────────────────

function KPIBar({ kpis }: { kpis: CRMKPIs | null }) {
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${n.toLocaleString('es-ES')}€`;
  const items = kpis ? [
    { label: 'PROYECTOS',  value: String(kpis.activeProjects), sub: `/${kpis.totalProjects}`, color: '#10b981' },
    { label: 'CLIENTES',   value: String(kpis.totalClients),   color: '#94a3b8' },
    { label: 'COBRADO',    value: fmt(kpis.paidRevenue),        color: '#10b981' },
    { label: 'POR COBRAR', value: fmt(kpis.pendingRevenue),     color: '#f59e0b' },
    { label: 'MARGEN',     value: fmt(kpis.paidRevenue - kpis.totalExpenses), color: (kpis.paidRevenue - kpis.totalExpenses) >= 0 ? '#10b981' : '#ef4444' },
  ] : Array(5).fill(null).map(() => ({ label: '···', value: '—', color: '#1e293b' }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 6, padding: '8px 14px', minWidth: 88 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.15em', marginBottom: 3 }}>{item?.label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: item?.color ?? '#e2e8f0', display: 'flex', alignItems: 'baseline', gap: 2 }}>
            {item?.value}
            {item && 'sub' in item && item.sub && <span style={{ fontSize: 10, color: '#475569', fontWeight: 400 }}>{item.sub}</span>}
          </div>
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <Link href="/crm" style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', textDecoration: 'none', padding: '6px 12px', border: '1px solid #10b98130', borderRadius: 4 }}>Pipeline →</Link>
        <Link href="/crm/projects" style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', textDecoration: 'none', padding: '6px 12px', border: '1px solid #0f2040', borderRadius: 4 }}>Proyectos</Link>
        <Link href="/crm/clients" style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', textDecoration: 'none', padding: '6px 12px', border: '1px solid #0f2040', borderRadius: 4 }}>Clientes</Link>
        <Link href="/crm/finanzas" style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', textDecoration: 'none', padding: '6px 12px', border: '1px solid #0f2040', borderRadius: 4 }}>Finanzas</Link>
      </div>
    </div>
  );
}

// ─── Live feed panel ──────────────────────────────────────────────────────────

function LiveFeed({ tasks, events, checkpoints }: { tasks: HatTask[]; events: BusEvent[]; checkpoints: HatCheckpoint[] }) {
  const active = tasks.filter(t => t.status === 'running' || t.status === 'pending').slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {checkpoints.length > 0 && (
        <div style={{ background: '#0d1a30', border: '1px solid #8b5cf640', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#a78bfa', letterSpacing: '0.15em', marginBottom: 8 }}>◆ CHECKPOINTS PENDIENTES</div>
          {checkpoints.slice(0, 3).map(cp => (
            <div key={cp.id} style={{ fontSize: 11, color: '#cbd5e1', padding: '5px 0', borderTop: '1px solid #1e3050', marginTop: 4 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#8b5cf6', marginRight: 8 }}>{cp.task_id}</span>
              {cp.reason}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.15em', marginBottom: 8 }}>TAREAS ACTIVAS</div>
        {active.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #0a1628' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[t.status] ?? '#475569', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.order_raw}</span>
            <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace', flexShrink: 0 }}>{t.status}</span>
          </div>
        ))}
        {active.length === 0 && <div style={{ fontSize: 11, color: '#1e293b', fontFamily: 'monospace', paddingTop: 4 }}>Sin tareas activas</div>}
      </div>

      <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.15em' }}>EN TIEMPO REAL</span>
        </div>
        {events.slice(0, 10).map(ev => (
          <div key={ev.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderTop: '1px solid #0a1628' }}>
            <span style={{ fontSize: 10, color: '#3b82f6', flexShrink: 0 }}>{EVENT_ICON[ev.event_type] ?? '·'}</span>
            <span style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.event_type}</span>
            <span style={{ fontSize: 9, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0 }}>{timeAgo(ev.created_at)}</span>
          </div>
        ))}
        {events.length === 0 && <div style={{ fontSize: 11, color: '#1e293b', fontFamily: 'monospace', paddingTop: 4 }}>Sin eventos</div>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JarvisPage() {
  const idPrefix = useId();

  const [commandLog, setCommandLog]       = useState<CommandEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentAction, setCurrentAction] = useState<CommandAction | undefined>();
  const [isLoading, setIsLoading]         = useState(false);
  const [isSpeakingOverride, setIsSpeakingOverride] = useState(false);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>();
  const [isAutoMode, setIsAutoMode]       = useState(false);

  const [kpis, setKpis]             = useState<CRMKPIs | null>(null);
  const [tasks, setTasks]           = useState<HatTask[]>([]);
  const [events, setEvents]         = useState<BusEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<HatCheckpoint[]>([]);

  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartTimeRef = useRef<number>(0);
  const speechDetectedRef  = useRef(false);
  const isProcessingRef    = useRef(false);

  const { voiceState, volume, startRecording, stopRecording, resetVoiceState, error } = useVoiceInput();
  const { speak } = useVoiceOutput((s) => setIsSpeakingOverride(s));

  const effectiveState: VoiceState = isSpeakingOverride ? 'speaking' : voiceState;

  useEffect(() => {
    getCRMKPIs().then(setKpis).catch(() => null);
    Promise.all([fetchTasks(), fetchRecentEvents(15), fetchCheckpoints('pending')])
      .then(([t, e, c]) => { setTasks(t); setEvents(e); setCheckpoints(c); })
      .catch(() => null);
  }, []);

  const refreshData = useCallback(() => {
    getCRMKPIs().then(setKpis).catch(() => null);
    fetchTasks().then(setTasks).catch(() => null);
    fetchCheckpoints('pending').then(setCheckpoints).catch(() => null);
  }, []);

  const runTextCommand = useCallback(async (text: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsLoading(true);
    setCurrentUserText(text);
    setCurrentResponse('');
    setCurrentAction(undefined);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as { response?: string; action?: CommandAction; error?: string };
      if (!res.ok || !data.response) {
        const msg = data.error ?? 'Ha habido un error. Intentalo de nuevo.';
        setCurrentResponse(msg); setIsLoading(false); void speak(msg); return;
      }
      setCurrentResponse(data.response);
      setCurrentAction(data.action);
      setIsLoading(false);
      await speak(data.response);
      setCommandLog(prev => [...prev, { id: `${idPrefix}-${Date.now()}`, userText: text, jarvisResponse: data.response!, timestamp: new Date() }]);
      if (data.action) refreshData();
    } catch (err) {
      setCurrentResponse(err instanceof Error ? err.message : 'Error al procesar.');
      setIsLoading(false);
    } finally {
      resetVoiceState();
      isProcessingRef.current = false;
    }
  }, [idPrefix, resetVoiceState, speak, refreshData]);

  const processAudio = useCallback(async (blob: Blob) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json() as { text?: string };
      if (!data.text?.trim()) {
        const msg = 'No te he entendido. Habla mas cerca del microfono.';
        setCurrentResponse(msg); setIsLoading(false); void speak(msg); return;
      }
      isProcessingRef.current = false;
      await runTextCommand(data.text.trim());
    } catch (err) {
      setCurrentResponse(err instanceof Error ? err.message : 'Error.'); setIsLoading(false);
    } finally {
      resetVoiceState();
      isProcessingRef.current = false;
    }
  }, [resetVoiceState, runTextCommand, speak]);

  const handlePressStart = useCallback(async () => {
    if (isAutoMode) return;
    setCurrentUserText(''); setCurrentResponse(''); setCurrentAction(undefined);
    await startRecording(selectedMicId);
  }, [startRecording, selectedMicId, isAutoMode]);

  const handlePressEnd = useCallback(async () => {
    if (isAutoMode) return;
    const blob = await stopRecording();
    if (!blob || blob.size < 100) { resetVoiceState(); return; }
    await processAudio(blob);
  }, [stopRecording, resetVoiceState, processAudio, isAutoMode]);

  useEffect(() => {
    if (!isAutoMode || voiceState !== 'listening' || isSpeakingOverride) return;
    if (volume >= VAD_THRESHOLD) {
      if (!speechDetectedRef.current) { speechDetectedRef.current = true; speechStartTimeRef.current = Date.now(); }
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    } else if (speechDetectedRef.current && !silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(async () => {
        silenceTimerRef.current = null;
        const dur = Date.now() - speechStartTimeRef.current;
        speechDetectedRef.current = false;
        if (dur < VAD_MIN_SPEECH_MS) return;
        const blob = await stopRecording();
        if (!blob || blob.size < 100) { resetVoiceState(); return; }
        await processAudio(blob);
      }, VAD_SILENCE_MS);
    }
  }, [volume, voiceState, isSpeakingOverride, isAutoMode, stopRecording, resetVoiceState, processAudio]);

  useEffect(() => {
    if (!isAutoMode) return;
    if (voiceState === 'idle' && !isSpeakingOverride && !isLoading && !isProcessingRef.current) {
      setCurrentUserText(''); setCurrentResponse(''); setCurrentAction(undefined);
      speechDetectedRef.current = false;
      void startRecording(selectedMicId);
    }
  }, [isAutoMode, voiceState, isSpeakingOverride, isLoading, startRecording, selectedMicId]);

  const toggleAutoMode = useCallback(async () => {
    if (isAutoMode) {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      speechDetectedRef.current = false;
      setIsAutoMode(false);
      if (voiceState === 'listening') { await stopRecording(); resetVoiceState(); }
    } else {
      setCurrentUserText(''); setCurrentResponse(''); setCurrentAction(undefined);
      setIsAutoMode(true);
    }
  }, [isAutoMode, voiceState, stopRecording, resetVoiceState]);

  return (
    <main style={{ minHeight: '100dvh', background: '#040810', color: '#e2e8f0', fontFamily: 'system-ui,-apple-system,sans-serif', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #0f2040', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#7c3aed', letterSpacing: '0.25em' }}>HAT3X</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>Aiden</span>
        </div>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#334155' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </header>

      {/* KPI bar + CRM nav */}
      <KPIBar kpis={kpis} />

      {/* Main layout: Jarvis center | Live feed right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, flex: 1, minHeight: 0 }}>

        {/* Jarvis core */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: '#060f1c', border: '1px solid #0f2040', borderRadius: 12, padding: '36px 28px', minHeight: 500 }}>
          <JarvisOrb state={effectiveState} />
          <Transcript userText={currentUserText} jarvisResponse={currentResponse} isLoading={isLoading} />
          <TextCommandInput disabled={isLoading || effectiveState === 'speaking'} onCommand={(text) => void runTextCommand(text)} />
          {error && <p style={{ fontSize: 11, color: '#f87171', textAlign: 'center' }}>{error}</p>}

          {isAutoMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #1e3050', background: '#07101f' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', letterSpacing: '0.15em' }}>
                  {effectiveState === 'speaking' ? 'out' : isLoading ? 'cpu' : 'in'}
                </span>
              </div>
              <button onClick={toggleAutoMode} style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', background: 'transparent', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
                detener
              </button>
            </div>
          ) : (
            <VoiceButton voiceState={effectiveState} onPressStart={handlePressStart} onPressEnd={handlePressEnd} disabled={isLoading} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {!isAutoMode && (
              <button onClick={toggleAutoMode} style={{ fontSize: 11, fontFamily: 'monospace', color: '#334155', background: 'transparent', border: '1px solid #0f2040', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
                modo continuo
              </button>
            )}
            <MicConfig deviceId={selectedMicId} onDeviceChange={setSelectedMicId} volume={volume} isListening={effectiveState === 'listening'} />
          </div>
        </div>

        {/* Right column: live feed + session log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          <LiveFeed tasks={tasks} events={events} checkpoints={checkpoints} />

          {commandLog.length > 0 && (
            <div style={{ background: '#07101f', border: '1px solid #0f2040', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.15em', marginBottom: 8 }}>SESION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {[...commandLog].reverse().map(entry => (
                  <div key={entry.id} style={{ borderLeft: '2px solid #1e3050', paddingLeft: 10 }}>
                    <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>› {entry.userText}</div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.jarvisResponse}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick commands */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Estado de proyectos', 'Cuánto hemos cobrado', 'Checkpoints pendientes', 'Resumen del día', 'Qué hay por cobrar'].map(cmd => (
          <button key={cmd} onClick={() => void runTextCommand(cmd)}
            disabled={isLoading || effectiveState === 'speaking'}
            style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', background: 'transparent', border: '1px solid #0f2040', borderRadius: 4, padding: '5px 11px', cursor: 'pointer', opacity: (isLoading || effectiveState === 'speaking') ? 0.4 : 1 }}>
            {cmd}
          </button>
        ))}
      </div>
    </main>
  );
}
