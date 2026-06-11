# HAT3X Command — Plan 10: Jarvis Proactive Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerrequisito:** Planes 8 y 9 completados.

**Goal:** Tres funciones proactivas que convierten Jarvis en asistente ejecutivo real: (1) briefing de voz automático al abrir la app, (2) wake word "Jarvis" sin pulsar botón, (3) modo dictado para capturar notas de reunión largas y estructurarlas con tareas automáticas.

**Architecture:**
- **Briefing matutino:** Al cargar la app, si es primera sesión del día (verificado con `localStorage` key `jarvis-briefing-date`), genera resumen de voz con datos de Supabase. API route GET `/api/briefing` construye el texto; el hook `useMorningBriefing` lo reproduce y actualiza localStorage para no repetirlo.
- **Wake word:** `@picovoice/porcupine-web` detecta la palabra "Jarvis" en el navegador sin enviar audio a servidores externos. Al detectarla, lanza el mismo flujo de grabación del Plan 8.
- **Modo dictado:** Grabación larga (hasta 5 minutos) → Whisper transcribe → Claude Sonnet estructura en secciones (resumen, decisiones, tareas, próximos pasos) → cada tarea identificada se crea en Supabase automáticamente.

**Tech Stack:** Plan 8/9 + `@picovoice/porcupine-web` (wake word browser-side).

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `apps/jarvis/src/types/jarvis.ts` | Modificar | Añadir DictationTask, DictationResult |
| `apps/jarvis/src/lib/briefing.ts` | Crear | generateBriefing(): texto de briefing desde Supabase |
| `apps/jarvis/src/app/api/briefing/route.ts` | Crear | GET: genera texto del briefing del día |
| `apps/jarvis/src/hooks/use-morning-briefing.ts` | Crear | Primera sesión del día → reproduce briefing |
| `apps/jarvis/src/components/briefing-overlay.tsx` | Crear | Overlay mientras Jarvis habla el briefing |
| `apps/jarvis/src/hooks/use-wake-word.ts` | Crear | Porcupine wake word → callback al detectar "Jarvis" |
| `apps/jarvis/src/lib/dictation-processor.ts` | Crear | processDictation(text) → DictationResult + crea tareas |
| `apps/jarvis/src/app/api/dictation/route.ts` | Crear | POST: audio largo → transcripción → DictationResult |
| `apps/jarvis/src/hooks/use-dictation.ts` | Crear | Grabación larga → API dictation → estado resultado |
| `apps/jarvis/src/components/dictation-panel.tsx` | Crear | UI: botón grabar, temporizador, resultado estructurado |
| `apps/jarvis/src/app/page.tsx` | Modificar | Integrar briefing, wake word y panel de dictado |
| `apps/jarvis/tests/lib/briefing.test.ts` | Crear | 3 tests: generateBriefing |
| `apps/jarvis/tests/lib/dictation-processor.test.ts` | Crear | 3 tests: processDictation |

---

## Task 1: Tipos para funciones proactivas

**Files:**
- Modify: `apps/jarvis/src/types/jarvis.ts`

- [ ] **Step 1: Añadir DictationTask y DictationResult al final de jarvis.ts**

```typescript
// Añadir al final de src/types/jarvis.ts

export interface DictationTask {
  description: string;
  clientId: string | null;
  priority: 'high' | 'medium' | 'low';
}

export interface DictationResult {
  summary: string;
  decisions: string[];
  tasks: DictationTask[];
  nextSteps: string[];
  createdTaskIds: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/jarvis/src/types/jarvis.ts
git commit -m "feat(jarvis): add dictation types"
```

---

## Task 2: Briefing matutino

**Files:**
- Create: `apps/jarvis/src/lib/briefing.ts`
- Create: `apps/jarvis/tests/lib/briefing.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/briefing.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([
    { id: 'HAT3X-001', client_id: 'biodental', order_raw: 'Web corporativa', status: 'running', created_at: '2026-05-28T10:00:00Z' },
    { id: 'HAT3X-002', client_id: 'obratech', order_raw: 'Agente de voz', status: 'pending', created_at: '2026-05-27T10:00:00Z' },
    { id: 'HAT3X-003', client_id: null, order_raw: 'Tarea interna', status: 'completed', created_at: '2026-05-26T10:00:00Z' },
  ]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([
    { id: 'cp-1', task_id: 'HAT3X-001', reason: 'Revisar diseño inicial', status: 'pending', triggered_at: '2026-05-28T09:00:00Z' },
  ]),
}));

describe('briefing generator', () => {
  beforeEach(() => { vi.resetModules(); });

  it('generates briefing text mentioning active task count', async () => {
    const { generateBriefing } = await import('@/lib/briefing');
    const text = await generateBriefing();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain('2'); // 2 active tasks
  });

  it('mentions pending checkpoints', async () => {
    const { generateBriefing } = await import('@/lib/briefing');
    const text = await generateBriefing();
    expect(text.toLowerCase()).toMatch(/checkpoint|aprobac|revisar|pendiente/i);
  });

  it('keeps text under 500 characters (suitable for TTS)', async () => {
    const { generateBriefing } = await import('@/lib/briefing');
    const text = await generateBriefing();
    expect(text.length).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/briefing.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/briefing'`

- [ ] **Step 3: Implementar src/lib/briefing.ts**

```typescript
// src/lib/briefing.ts
import { readTasks, readPendingCheckpoints } from '@/lib/supabase';

export async function generateBriefing(): Promise<string> {
  const [tasks, checkpoints] = await Promise.all([readTasks(), readPendingCheckpoints()]);

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');
  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const checkpointCount = checkpoints.length;

  const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const parts: string[] = [];

  parts.push(`Buenos días. Hoy es ${date}.`);

  if (activeTasks.length === 0) {
    parts.push('No tienes tareas activas en este momento.');
  } else {
    parts.push(
      `Tienes ${activeTasks.length} tarea${activeTasks.length > 1 ? 's' : ''} activa${activeTasks.length > 1 ? 's' : ''}: ${runningCount} en curso y ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}.`
    );
    const withClient = activeTasks.filter((t) => t.client_id).slice(0, 3);
    if (withClient.length > 0) {
      parts.push(`Proyectos activos: ${withClient.map((t) => t.client_id).join(', ')}.`);
    }
  }

  if (checkpointCount > 0) {
    parts.push(
      `Tienes ${checkpointCount} checkpoint${checkpointCount > 1 ? 's' : ''} pendiente${checkpointCount > 1 ? 's' : ''} de aprobación.`
    );
  }

  parts.push('¿En qué trabajamos hoy?');
  return parts.join(' ');
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/briefing.test.ts
```

Expected: `PASS — 3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/briefing.ts apps/jarvis/tests/lib/briefing.test.ts
git commit -m "feat(jarvis): add morning briefing generator with tests"
```

---

## Task 3: API route y hook useMorningBriefing

**Files:**
- Create: `apps/jarvis/src/app/api/briefing/route.ts`
- Create: `apps/jarvis/src/hooks/use-morning-briefing.ts`
- Create: `apps/jarvis/src/components/briefing-overlay.tsx`
- Modify: `apps/jarvis/src/app/page.tsx`

- [ ] **Step 1: Crear api/briefing/route.ts**

```typescript
// src/app/api/briefing/route.ts
import { NextResponse } from 'next/server';
import { generateBriefing } from '@/lib/briefing';

export async function GET(): Promise<NextResponse> {
  try {
    const text = await generateBriefing();
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/briefing]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear src/hooks/use-morning-briefing.ts**

```typescript
// src/hooks/use-morning-briefing.ts
'use client';
import { useEffect, useState, useCallback } from 'react';

const BRIEFING_KEY = 'jarvis-briefing-date';

interface UseMorningBriefingReturn {
  isBriefing: boolean;
  briefingText: string;
  skipBriefing: () => void;
}

export function useMorningBriefing(
  onSpeak: (text: string) => Promise<void>,
): UseMorningBriefingReturn {
  const [isBriefing, setIsBriefing] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const skipBriefing = useCallback(() => setIsBriefing(false), []);

  useEffect(() => {
    const today = new Date().toDateString();
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(BRIEFING_KEY) === today) return;

    let cancelled = false;
    async function run() {
      try {
        const res = await fetch('/api/briefing');
        if (!res.ok || cancelled) return;
        const { text } = await res.json() as { text: string };
        if (cancelled) return;
        setBriefingText(text);
        setIsBriefing(true);
        await onSpeak(text);
        if (!cancelled) {
          localStorage.setItem(BRIEFING_KEY, today);
          setIsBriefing(false);
        }
      } catch {
        setIsBriefing(false);
      }
    }

    const timeout = setTimeout(run, 900);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [onSpeak]);

  return { isBriefing, briefingText, skipBriefing };
}
```

- [ ] **Step 3: Crear src/components/briefing-overlay.tsx**

```tsx
// src/components/briefing-overlay.tsx
'use client';

interface BriefingOverlayProps {
  text: string;
  onSkip: () => void;
}

export function BriefingOverlay({ text, onSkip }: BriefingOverlayProps) {
  return (
    <div className="fixed inset-0 bg-jarvis-bg/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center px-8">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center gap-1 items-end h-8">
          {[0, 80, 160, 240, 320].map((delay) => (
            <span
              key={delay}
              className="w-1.5 bg-violet-400 rounded animate-bounce"
              style={{
                height: `${16 + (delay % 160 === 0 ? 10 : delay % 80 === 0 ? 6 : 0)}px`,
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
        <p className="text-jarvis-text text-sm leading-relaxed">{text}</p>
        <button
          onClick={onSkip}
          className="text-jarvis-muted text-xs font-mono hover:text-jarvis-text transition-colors"
        >
          omitir
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrar en page.tsx**

En `apps/jarvis/src/app/page.tsx` hacer los siguientes cambios:

**4a. Añadir imports:**
```tsx
import { useMorningBriefing } from '@/hooks/use-morning-briefing';
import { BriefingOverlay } from '@/components/briefing-overlay';
```

**4b. Añadir hook después de useVoiceOutput:**
```tsx
const { isBriefing, briefingText, skipBriefing } = useMorningBriefing(speak);
```

**4c. Añadir overlay antes del cierre de `</main>`:**
```tsx
{isBriefing && <BriefingOverlay text={briefingText} onSkip={skipBriefing} />}
```

- [ ] **Step 5: Verificar briefing**

```bash
cd apps/jarvis && npm run dev
```

Borrar la clave de localStorage desde DevTools (Application → Local Storage → eliminar `jarvis-briefing-date`). Recargar. Verificar:
- [ ] Overlay aparece con texto del briefing
- [ ] ElevenLabs reproduce el briefing en voz
- [ ] Al terminar, overlay desaparece
- [ ] Recargar de nuevo: no se repite el briefing
- [ ] Botón "omitir" cierra el overlay inmediatamente

- [ ] **Step 6: Commit**

```bash
git add apps/jarvis/src/app/api/briefing/ apps/jarvis/src/hooks/use-morning-briefing.ts apps/jarvis/src/components/briefing-overlay.tsx apps/jarvis/src/app/page.tsx
git commit -m "feat(jarvis): add morning briefing — voice summary on first daily session"
```

---

## Task 4: Wake Word "Jarvis" con Porcupine

**Files:**
- Create: `apps/jarvis/src/hooks/use-wake-word.ts`
- Modify: `apps/jarvis/src/app/page.tsx`

- [ ] **Step 1: Instalar Porcupine**

```bash
cd apps/jarvis && npm install @picovoice/porcupine-web @picovoice/web-voice-processor
```

- [ ] **Step 2: Añadir variable de entorno**

En `.env.local` y `.env.local.example`:
```
# Picovoice — wake word (plan gratuito en https://console.picovoice.ai/)
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=tu-access-key-aqui
```

> Crear cuenta gratuita en https://console.picovoice.ai/ → AccessKey. El plan gratuito permite uso no comercial. Verificar términos para uso comercial.

- [ ] **Step 3: Implementar src/hooks/use-wake-word.ts**

```typescript
// src/hooks/use-wake-word.ts
'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWakeWordReturn {
  isListeningForWakeWord: boolean;
  wakeWordError: string | null;
  startWakeWord: () => Promise<void>;
  stopWakeWord: () => void;
}

export function useWakeWord(onDetected: () => void): UseWakeWordReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<{ release: () => Promise<void> } | null>(null);

  const stop = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.release();
      engineRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const accessKey = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY;
    if (!accessKey) {
      setError('Picovoice access key not set — wake word disabled');
      return;
    }

    try {
      const { PorcupineWorker } = await import('@picovoice/porcupine-web');
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');

      const porcupine = await PorcupineWorker.create(
        accessKey,
        [{ label: 'Jarvis', sensitivity: 0.5 }],
        (keywordIndex: number) => { if (keywordIndex === 0) onDetected(); },
        { publicPath: '/porcupine-models/' },
      );

      await WebVoiceProcessor.subscribe(porcupine);
      engineRef.current = {
        release: async () => {
          await WebVoiceProcessor.unsubscribe(porcupine);
          porcupine.terminate();
        },
      };
      setIsListening(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Wake word init failed';
      setError(msg);
      console.warn('[useWakeWord]', msg);
    }
  }, [onDetected]);

  useEffect(() => () => { engineRef.current?.release(); }, []);

  return {
    isListeningForWakeWord: isListening,
    wakeWordError: error,
    startWakeWord: start,
    stopWakeWord: stop,
  };
}
```

> **Nota sobre modelos:** Porcupine Web necesita el archivo de modelo en `public/porcupine-models/porcupine_params.pv`. Descargarlo desde https://github.com/Picovoice/porcupine/tree/master/lib/common y copiarlo a `apps/jarvis/public/porcupine-models/`. El keyword "Jarvis" en inglés está incluido en el SDK por defecto.

- [ ] **Step 4: Integrar wake word en page.tsx**

**4a. Import:**
```tsx
import { useWakeWord } from '@/hooks/use-wake-word';
```

**4b. Añadir hook en JarvisPage (después de useMorningBriefing):**
```tsx
const { isListeningForWakeWord, startWakeWord, wakeWordError } = useWakeWord(
  useCallback(() => {
    if (voiceState === 'idle' && !isLoading && !isBriefing) {
      handlePressStart();
    }
  }, [voiceState, isLoading, isBriefing, handlePressStart]),
);
```

**4c. Actualizar el header para incluir el botón de wake word:**
```tsx
{/* Reemplazar el div del header con: */}
<div className="w-full max-w-lg flex items-center justify-between">
  <span className="text-jarvis-muted text-xs font-mono uppercase tracking-widest">HAT3X</span>
  <div className="flex items-center gap-4">
    <button
      onClick={() => { void (isListeningForWakeWord ? stopWakeWord() : startWakeWord()); }}
      className={`text-xs font-mono transition-colors ${
        isListeningForWakeWord ? 'text-violet-400' : 'text-jarvis-muted hover:text-jarvis-text'
      }`}
      title={isListeningForWakeWord ? 'Wake word activo — di "Jarvis"' : 'Activar wake word'}
    >
      {isListeningForWakeWord ? '◉ escuchando' : '○ wake word'}
    </button>
    <span className="text-jarvis-muted text-xs font-mono">
      {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
    </span>
  </div>
</div>
```

También añadir `stopWakeWord` al destructuring del hook de wake word:
```tsx
const { isListeningForWakeWord, startWakeWord, stopWakeWord, wakeWordError } = useWakeWord(...)
```

- [ ] **Step 5: Verificar wake word**

```bash
cd apps/jarvis && npm run dev
```

1. Pulsar "○ wake word" en el header → cambia a "◉ escuchando"
2. Decir claramente "Jarvis"
3. El orb debe cambiar a estado `listening` automáticamente
4. Hablar el comando y verificar que funciona igual que con el botón

> Si el wake word no funciona (error de modelo), la app sigue funcionando con el botón. El error aparece en la consola del navegador.

- [ ] **Step 6: Commit**

```bash
git add apps/jarvis/src/hooks/use-wake-word.ts apps/jarvis/src/app/page.tsx apps/jarvis/package.json apps/jarvis/package-lock.json
git commit -m "feat(jarvis): add Porcupine wake word — say 'Jarvis' to activate hands-free"
```

---

## Task 5: Modo dictado — reuniones

**Files:**
- Create: `apps/jarvis/src/lib/dictation-processor.ts`
- Create: `apps/jarvis/tests/lib/dictation-processor.test.ts`
- Create: `apps/jarvis/src/app/api/dictation/route.ts`
- Create: `apps/jarvis/src/hooks/use-dictation.ts`
- Create: `apps/jarvis/src/components/dictation-panel.tsx`
- Modify: `apps/jarvis/src/app/page.tsx`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/dictation-processor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Reunión con BioDental sobre rediseño web.',
            decisions: ['Añadir sección de precios', 'Cambiar colores a azul corporativo'],
            tasks: [
              { description: 'Rediseñar sección de precios de BioDental', clientId: 'biodental', priority: 'high' },
              { description: 'Actualizar paleta de colores de BioDental', clientId: 'biodental', priority: 'medium' },
            ],
            nextSteps: ['Enviar propuesta esta semana', 'Reunión de seguimiento en 15 días'],
          }),
        }],
      }),
    },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  createTask: vi.fn()
    .mockResolvedValueOnce('HAT3X-001')
    .mockResolvedValueOnce('HAT3X-002'),
}));

describe('dictation processor', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns structured result from meeting text', async () => {
    const { processDictation } = await import('@/lib/dictation-processor');
    const result = await processDictation('Reunión con BioDental. Han pedido rediseñar precios y cambiar colores.');
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.decisions).toHaveLength(2);
    expect(result.tasks).toHaveLength(2);
    expect(result.nextSteps).toHaveLength(2);
  });

  it('creates tasks in Supabase for each identified task', async () => {
    const { processDictation } = await import('@/lib/dictation-processor');
    const result = await processDictation('texto reunión');
    expect(result.createdTaskIds).toHaveLength(2);
    expect(result.createdTaskIds[0]).toBe('HAT3X-001');
  });

  it('handles text with no actionable tasks gracefully', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ summary: 'Conversación informal.', decisions: [], tasks: [], nextSteps: [] }) }],
        }),
      },
    } as any));
    const { processDictation } = await import('@/lib/dictation-processor');
    const result = await processDictation('solo hablamos de temas generales');
    expect(result.tasks).toHaveLength(0);
    expect(result.createdTaskIds).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/dictation-processor.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/dictation-processor'`

- [ ] **Step 3: Implementar src/lib/dictation-processor.ts**

```typescript
// src/lib/dictation-processor.ts
import Anthropic from '@anthropic-ai/sdk';
import { createTask } from '@/lib/supabase';
import type { DictationResult, DictationTask } from '@/types/jarvis';

const SYSTEM = `Eres un asistente ejecutivo que analiza notas de reuniones de HAT3X (consultora de IA).

Devuelve SOLO un objeto JSON con la estructura de las notas. Sin texto adicional.

Schema:
{
  "summary": "resumen en 1-2 frases de qué trató la reunión",
  "decisions": ["decisión tomada 1", "decisión tomada 2"],
  "tasks": [
    {
      "description": "acción concreta pendiente",
      "clientId": "nombre-cliente-minusculas-sin-espacios o null si es tarea interna",
      "priority": "high" | "medium" | "low"
    }
  ],
  "nextSteps": ["próximo paso 1", "próximo paso 2"]
}

Incluye como task cualquier acción que se mencionó como pendiente.
Si no hay decisiones, tasks o nextSteps, devuelve arrays vacíos.`;

export async function processDictation(text: string): Promise<DictationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Analiza estas notas de reunión:\n\n${text}` }],
  });

  const first = message.content[0];
  if (first.type !== 'text') throw new Error('Unexpected response type');

  const jsonMatch = first.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  const parsed = JSON.parse(jsonMatch[0]) as {
    summary: string;
    decisions: string[];
    tasks: DictationTask[];
    nextSteps: string[];
  };

  const createdTaskIds: string[] = [];
  for (const task of parsed.tasks) {
    try {
      const id = await createTask({ description: task.description, clientId: task.clientId });
      createdTaskIds.push(id);
    } catch (err) {
      console.error('[dictation-processor] createTask failed:', err);
    }
  }

  return {
    summary: parsed.summary,
    decisions: parsed.decisions,
    tasks: parsed.tasks,
    nextSteps: parsed.nextSteps,
    createdTaskIds,
  };
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/dictation-processor.test.ts
```

Expected: `PASS — 3 tests passed`

- [ ] **Step 5: Crear api/dictation/route.ts**

```typescript
// src/app/api/dictation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';
import { processDictation } from '@/lib/dictation-processor';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }
    const buffer = Buffer.from(await audio.arrayBuffer());
    const text = await transcribeAudio(buffer, 'dictation.webm');
    const result = await processDictation(text);
    return NextResponse.json({ transcript: text, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/dictation]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Crear src/hooks/use-dictation.ts**

```typescript
// src/hooks/use-dictation.ts
'use client';
import { useState, useRef, useCallback } from 'react';
import type { DictationResult } from '@/types/jarvis';

type DictationState = 'idle' | 'recording' | 'processing' | 'done';

interface UseDictationReturn {
  state: DictationState;
  result: DictationResult | null;
  elapsedSeconds: number;
  startDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
  reset: () => void;
}

export function useDictation(): UseDictationReturn {
  const [state, setState] = useState<DictationState>('idle');
  const [result, setResult] = useState<DictationResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startDictation = useCallback(async () => {
    setResult(null);
    setElapsedSeconds(0);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(200);
    mediaRecorderRef.current = recorder;
    setState('recording');
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  }, []);

  const stopDictation = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
    mediaRecorderRef.current = null;
    setState('processing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'dictation.webm');
      const res = await fetch('/api/dictation', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`dictation API error ${res.status}`);
      const data = await res.json() as DictationResult & { transcript: string };
      setResult(data);
      setState('done');
    } catch (err) {
      console.error('[useDictation]', err);
      setState('idle');
    }
  }, []);

  const reset = useCallback(() => { setState('idle'); setResult(null); setElapsedSeconds(0); }, []);
  return { state, result, elapsedSeconds, startDictation, stopDictation, reset };
}
```

- [ ] **Step 7: Crear src/components/dictation-panel.tsx**

```tsx
// src/components/dictation-panel.tsx
'use client';
import { useDictation } from '@/hooks/use-dictation';

export function DictationPanel() {
  const { state, result, elapsedSeconds, startDictation, stopDictation, reset } = useDictation();
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="w-full max-w-lg">
      {state === 'idle' && (
        <button
          onClick={startDictation}
          className="w-full py-3 border border-jarvis-border rounded-xl text-jarvis-muted text-xs font-mono hover:border-violet-600/50 hover:text-jarvis-text transition-all"
        >
          📝 modo dictado — notas de reunión
        </button>
      )}

      {state === 'recording' && (
        <div className="border border-red-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-mono">grabando reunión</span>
            </div>
            <span className="text-jarvis-muted text-xs font-mono">{fmt(elapsedSeconds)}</span>
          </div>
          <button
            onClick={stopDictation}
            className="w-full py-2 bg-red-900/30 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono hover:bg-red-900/50 transition-all"
          >
            detener y procesar
          </button>
        </div>
      )}

      {state === 'processing' && (
        <div className="border border-jarvis-border rounded-xl p-4 text-center">
          <p className="text-jarvis-muted text-xs font-mono animate-pulse">procesando notas de reunión...</p>
        </div>
      )}

      {state === 'done' && result && (
        <div className="border border-violet-800/30 rounded-xl p-4 space-y-4">
          <div>
            <p className="text-violet-400 text-xs font-mono uppercase tracking-wider mb-1">Resumen</p>
            <p className="text-jarvis-text text-sm">{result.summary}</p>
          </div>
          {result.decisions.length > 0 && (
            <div>
              <p className="text-violet-400 text-xs font-mono uppercase tracking-wider mb-1">Decisiones</p>
              <ul className="space-y-1">
                {result.decisions.map((d, i) => (
                  <li key={i} className="text-jarvis-text text-xs flex gap-2"><span className="text-violet-500">—</span> {d}</li>
                ))}
              </ul>
            </div>
          )}
          {result.tasks.length > 0 && (
            <div>
              <p className="text-violet-400 text-xs font-mono uppercase tracking-wider mb-1">
                Tareas creadas ({result.createdTaskIds.length})
              </p>
              <ul className="space-y-1">
                {result.tasks.map((t, i) => (
                  <li key={i} className="text-jarvis-text text-xs flex gap-2 items-start">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{t.description}{t.clientId && <span className="text-jarvis-muted ml-1">({t.clientId})</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.nextSteps.length > 0 && (
            <div>
              <p className="text-violet-400 text-xs font-mono uppercase tracking-wider mb-1">Próximos pasos</p>
              <ul className="space-y-1">
                {result.nextSteps.map((s, i) => (
                  <li key={i} className="text-jarvis-text text-xs flex gap-2"><span className="text-blue-400">→</span> {s}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={reset} className="text-jarvis-muted text-xs font-mono hover:text-jarvis-text transition-colors">
            nuevo dictado
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Integrar DictationPanel en page.tsx**

**8a. Import:**
```tsx
import { DictationPanel } from '@/components/dictation-panel';
```

**8b. Añadir el panel en el JSX entre VoiceButton y CommandLog:**
```tsx
<DictationPanel />
```

- [ ] **Step 9: Verificar modo dictado**

```bash
cd apps/jarvis && npm run dev
```

1. Pulsar "📝 modo dictado — notas de reunión"
2. Hablar durante 30-60 segundos: *"Hemos tenido reunión con BioDental. Han pedido tres cambios: añadir sección de precios, cambiar los colores a su identidad corporativa, e integrar formulario de cita previa. Decidimos empezar por el formulario. Próximo paso: enviar propuesta esta semana."*
3. Pulsar "detener y procesar"
4. Verificar el resultado estructurado en pantalla
5. Verificar en Supabase dashboard que las tareas se crearon en `hat3x_tasks`

- [ ] **Step 10: Commit**

```bash
git add apps/jarvis/src/lib/dictation-processor.ts apps/jarvis/tests/lib/dictation-processor.test.ts apps/jarvis/src/app/api/dictation/ apps/jarvis/src/hooks/use-dictation.ts apps/jarvis/src/components/dictation-panel.tsx apps/jarvis/src/app/page.tsx
git commit -m "feat(jarvis): add meeting dictation mode — audio → structured notes → auto tasks"
```

---

## Task 6: Suite completa y verificación final

**Files:** ninguno nuevo

- [ ] **Step 1: Ejecutar todos los tests**

```bash
cd apps/jarvis && npx vitest run
```

Expected: `PASS — 35 tests passed`
(26 del Plan 9 + 3 briefing + 3 dictation-processor + 2 command-handler = 34+)

- [ ] **Step 2: Build de producción**

```bash
cd apps/jarvis && npm run build
```

Expected: sin errores TypeScript.

- [ ] **Step 3: Checklist de funciones proactivas**

| Función | Verificar |
|---|---|
| Briefing matutino | Borrar localStorage → recargar → Jarvis habla el briefing |
| Briefing no se repite | Recargar la misma sesión → sin briefing |
| Wake word | Pulsar "○ wake word" → decir "Jarvis" → entra en modo escucha |
| Dictado — grabación | Grabar 30s de notas de reunión |
| Dictado — estructura | Resultado muestra resumen, decisiones, tareas y próximos pasos |
| Dictado — Supabase | Verificar nuevas filas en `hat3x_tasks` en Supabase dashboard |
| Todo funciona en móvil | Abrir la PWA instalada en móvil y probar las 3 funciones |

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(jarvis): Plan 10 complete — briefing, wake word and meeting dictation"
```

---

## Verificación final del plan vs requisitos

| Requisito | Tarea |
|---|---|
| Briefing de voz automático al abrir la app | Tasks 2, 3 |
| Solo una vez por día, no en cada recarga | Task 3 (localStorage `jarvis-briefing-date`) |
| Wake word "Jarvis" sin pulsar botón | Task 4 |
| Modo dictado para reuniones | Task 5 |
| Notas de reunión → tareas automáticas en Supabase | Task 5 (dictation-processor) |
| Resultado estructurado visible en la UI | Task 5 (dictation-panel) |
| Tests para toda la nueva lógica | Tasks 2, 5 |
| Funciona en PWA móvil | Task 6 (checklist) |
