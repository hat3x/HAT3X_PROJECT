# HAT3X Command — Plan 8: Jarvis Voice Interface (PWA Core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una PWA instalable (móvil y escritorio) que permite a José hablar con Jarvis por voz: graba audio → transcribe con Whisper → procesa con Claude → responde con ElevenLabs.

**Architecture:** Next.js 14 App Router en `apps/jarvis/`. El servidor Next.js actúa como proxy seguro para todas las APIs externas — el cliente solo accede al micrófono y reproduce audio. Supabase es la única fuente de verdad para datos. Protección por token simple (variable de entorno), sin registro de usuarios. La PWA es instalable en móvil y escritorio vía `next-pwa`.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind CSS v3, next-pwa, openai SDK (Whisper), ElevenLabs REST, @anthropic-ai/sdk (Claude para comandos), @supabase/supabase-js, Vitest, @testing-library/react.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `apps/jarvis/package.json` | Crear | Dependencias y scripts del app |
| `apps/jarvis/next.config.ts` | Crear | Config Next.js + PWA |
| `apps/jarvis/tsconfig.json` | Crear | TypeScript strict |
| `apps/jarvis/.env.local.example` | Crear | Variables de entorno necesarias |
| `apps/jarvis/public/manifest.json` | Crear | PWA manifest |
| `apps/jarvis/tailwind.config.ts` | Crear | Dark theme + animaciones del orb |
| `apps/jarvis/postcss.config.js` | Crear | PostCSS para Tailwind |
| `apps/jarvis/vitest.config.ts` | Crear | Config Vitest para Next.js |
| `apps/jarvis/src/types/jarvis.ts` | Crear | Tipos: VoiceState, CommandEntry, DbTask, DbClient |
| `apps/jarvis/src/lib/supabase.ts` | Crear | readTasks, readClients, readPendingCheckpoints |
| `apps/jarvis/src/lib/whisper.ts` | Crear | transcribeAudio(buffer, filename) → string |
| `apps/jarvis/src/lib/elevenlabs.ts` | Crear | synthesizeSpeech(text) → Buffer |
| `apps/jarvis/src/lib/command-handler.ts` | Crear | handleCommand(text) → { response } vía Claude |
| `apps/jarvis/src/app/api/transcribe/route.ts` | Crear | POST: FormData(audio) → `{ text }` |
| `apps/jarvis/src/app/api/speak/route.ts` | Crear | POST: `{ text }` → audio/mpeg stream |
| `apps/jarvis/src/app/api/command/route.ts` | Crear | POST: `{ text }` → `{ response }` |
| `apps/jarvis/src/hooks/use-voice-input.ts` | Crear | MediaRecorder state machine |
| `apps/jarvis/src/hooks/use-voice-output.ts` | Crear | Cola de reproducción ElevenLabs |
| `apps/jarvis/src/components/jarvis-orb.tsx` | Crear | Orb animado con 4 estados visuales |
| `apps/jarvis/src/components/voice-button.tsx` | Crear | Botón hold-to-talk |
| `apps/jarvis/src/components/transcript.tsx` | Crear | Texto transcrito + respuesta activa |
| `apps/jarvis/src/components/command-log.tsx` | Crear | Historial de comandos de la sesión |
| `apps/jarvis/src/app/globals.css` | Crear | Dark theme base |
| `apps/jarvis/src/app/layout.tsx` | Crear | Root layout con PWA meta tags |
| `apps/jarvis/src/app/page.tsx` | Crear | Página principal — orquesta todos los hooks |
| `apps/jarvis/tests/lib/supabase.test.ts` | Crear | Tests: readTasks, readClients, readPendingCheckpoints |
| `apps/jarvis/tests/lib/whisper.test.ts` | Crear | Tests: transcribeAudio |
| `apps/jarvis/tests/lib/elevenlabs.test.ts` | Crear | Tests: synthesizeSpeech |
| `apps/jarvis/tests/lib/command-handler.test.ts` | Crear | Tests: handleCommand |

---

## Task 1: Scaffold — package.json, tsconfig, next.config, env

**Files:**
- Create: `apps/jarvis/package.json`
- Create: `apps/jarvis/tsconfig.json`
- Create: `apps/jarvis/next.config.ts`
- Create: `apps/jarvis/.env.local.example`
- Create: `apps/jarvis/vitest.config.ts`
- Create: `apps/jarvis/tailwind.config.ts`
- Create: `apps/jarvis/postcss.config.js`

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "jarvis",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.36.3",
    "@supabase/supabase-js": "^2.49.4",
    "next": "14.2.29",
    "next-pwa": "^5.6.0",
    "openai": "^4.98.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20.17.50",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.5.1",
    "autoprefixer": "^10.4.21",
    "jsdom": "^26.1.0",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

```bash
cd apps/jarvis && npm install
```

Expected: `node_modules/` creado sin errores.

- [ ] **Step 3: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Crear next.config.ts**

```typescript
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
```

- [ ] **Step 5: Crear .env.local.example**

```
# OpenAI — Whisper STT
OPENAI_API_KEY=sk-...

# ElevenLabs — TTS
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...

# Anthropic — Claude command interpreter
ANTHROPIC_API_KEY=sk-ant-...

# Supabase — server-side only (never exposed to browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

- [ ] **Step 6: Crear vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 7: Crear tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'jarvis-bg': '#040810',
        'jarvis-surface': '#0a1020',
        'jarvis-border': '#1a2540',
        'jarvis-accent': '#7c3aed',
        'jarvis-glow': '#a855f7',
        'jarvis-text': '#e2e8f0',
        'jarvis-muted': '#64748b',
      },
      keyframes: {
        'orb-idle': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.04)', opacity: '1' },
        },
        'orb-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.08)', opacity: '1' },
        },
        'ring-expand': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'orb-idle': 'orb-idle 3s ease-in-out infinite',
        'orb-pulse': 'orb-pulse 0.8s ease-in-out infinite',
        'ring-1': 'ring-expand 2s ease-out infinite',
        'ring-2': 'ring-expand 2s ease-out 0.5s infinite',
        'ring-3': 'ring-expand 2s ease-out 1s infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 8: Crear postcss.config.js**

```javascript
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 9: Commit**

```bash
git add apps/jarvis/
git commit -m "feat(jarvis): scaffold Next.js PWA app with Tailwind dark theme"
```

---

## Task 2: Tipos compartidos y PWA manifest

**Files:**
- Create: `apps/jarvis/src/types/jarvis.ts`
- Create: `apps/jarvis/public/manifest.json`

- [ ] **Step 1: Crear src/types/jarvis.ts**

```typescript
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface CommandEntry {
  id: string;
  userText: string;
  jarvisResponse: string;
  timestamp: Date;
}

export interface TranscribeResponse {
  text: string;
}

export interface CommandResponse {
  response: string;
}

// Refleja el esquema de Supabase hat3x_tasks (solo lectura)
export interface DbTask {
  id: string;
  client_id: string | null;
  order_raw: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
}

// Refleja hat3x_clients
export interface DbClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

// Refleja hat3x_checkpoints
export interface DbCheckpoint {
  id: string;
  task_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  triggered_at: string;
}
```

- [ ] **Step 2: Crear public/manifest.json**

```json
{
  "name": "Jarvis — HAT3X",
  "short_name": "Jarvis",
  "description": "Asistente ejecutivo de voz para HAT3X",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#040810",
  "theme_color": "#7c3aed",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

> Los archivos `public/icons/icon-192.png` y `public/icons/icon-512.png` deben crearse manualmente (logo HAT3X sobre fondo `#040810`). La PWA funciona sin ellos pero muestra icono genérico.

- [ ] **Step 3: Commit**

```bash
git add apps/jarvis/src/types/jarvis.ts apps/jarvis/public/manifest.json
git commit -m "feat(jarvis): add shared types and PWA manifest"
```

---

## Task 3: Supabase read bridge

**Files:**
- Create: `apps/jarvis/src/lib/supabase.ts`
- Create: `apps/jarvis/tests/lib/supabase.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('supabase read bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('readTasks returns array when Supabase returns data', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'HAT3X-001', client_id: 'biodental', order_raw: 'Web corporativa', status: 'running', created_at: '2026-05-28T10:00:00Z' },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }),
      }),
    } as any);

    const { readTasks } = await import('@/lib/supabase');
    const result = await readTasks();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('HAT3X-001');
  });

  it('readTasks returns empty array on Supabase error', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'connection error' } }) }),
      }),
    } as any);

    const { readTasks } = await import('@/lib/supabase');
    const result = await readTasks();
    expect(result).toEqual([]);
  });

  it('readClients returns array of clients', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'biodental', name: 'BioDental', sector: 'salud', notes: 'Cliente activo', previous_projects: [] },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }),
      }),
    } as any);

    const { readClients } = await import('@/lib/supabase');
    const result = await readClients();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('BioDental');
  });

  it('readPendingCheckpoints returns only pending items', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'cp-1', task_id: 'HAT3X-001', reason: 'Revisar diseño', status: 'pending', triggered_at: '2026-05-28T09:00:00Z' },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }) }),
      }),
    } as any);

    const { readPendingCheckpoints } = await import('@/lib/supabase');
    const result = await readPendingCheckpoints();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/supabase.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/supabase'`

- [ ] **Step 3: Implementar src/lib/supabase.ts**

```typescript
import { createClient } from '@supabase/supabase-js';
import type { DbTask, DbClient, DbCheckpoint } from '@/types/jarvis';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export async function readTasks(): Promise<DbTask[]> {
  const { data, error } = await getClient()
    .from('hat3x_tasks')
    .select('id, client_id, order_raw, status, created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error('[supabase] readTasks:', error.message); return []; }
  return (data ?? []) as DbTask[];
}

export async function readClients(): Promise<DbClient[]> {
  const { data, error } = await getClient()
    .from('hat3x_clients')
    .select('id, name, sector, notes, previous_projects')
    .order('name');
  if (error) { console.error('[supabase] readClients:', error.message); return []; }
  return (data ?? []) as DbClient[];
}

export async function readPendingCheckpoints(): Promise<DbCheckpoint[]> {
  const { data, error } = await getClient()
    .from('hat3x_checkpoints')
    .select('id, task_id, reason, status, triggered_at')
    .eq('status', 'pending')
    .order('triggered_at', { ascending: false });
  if (error) { console.error('[supabase] readPendingCheckpoints:', error.message); return []; }
  return (data ?? []) as DbCheckpoint[];
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/supabase.test.ts
```

Expected: `PASS — 4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/supabase.ts apps/jarvis/tests/lib/supabase.test.ts
git commit -m "feat(jarvis): add Supabase read bridge with tests"
```

---

## Task 4: Whisper transcription wrapper

**Files:**
- Create: `apps/jarvis/src/lib/whisper.ts`
- Create: `apps/jarvis/tests/lib/whisper.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/whisper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: 'hola jarvis qué proyectos tenemos activos' }),
      },
    },
  })),
}));

describe('whisper transcription', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('returns transcribed text from audio buffer', async () => {
    const { transcribeAudio } = await import('@/lib/whisper');
    const result = await transcribeAudio(Buffer.from('fake-audio-data'), 'recording.webm');
    expect(result).toBe('hola jarvis qué proyectos tenemos activos');
  });

  it('throws if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { transcribeAudio } = await import('@/lib/whisper');
    await expect(transcribeAudio(Buffer.from('data'), 'recording.webm')).rejects.toThrow('Missing OPENAI_API_KEY');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/whisper.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/whisper'`

- [ ] **Step 3: Implementar src/lib/whisper.ts**

```typescript
import OpenAI from 'openai';

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const client = new OpenAI({ apiKey });
  const file = new File([audioBuffer], filename, { type: 'audio/webm' });

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',
  });

  return response.text;
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/whisper.test.ts
```

Expected: `PASS — 2 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/whisper.ts apps/jarvis/tests/lib/whisper.test.ts
git commit -m "feat(jarvis): add Whisper transcription wrapper with tests"
```

---

## Task 5: ElevenLabs TTS wrapper

**Files:**
- Create: `apps/jarvis/src/lib/elevenlabs.ts`
- Create: `apps/jarvis/tests/lib/elevenlabs.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/elevenlabs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('fetch', vi.fn());

describe('elevenlabs TTS', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ELEVENLABS_API_KEY = 'test-key';
    process.env.ELEVENLABS_VOICE_ID = 'test-voice-id';
  });

  it('returns Buffer from successful response', async () => {
    const mockBuffer = Buffer.from('mock-audio-bytes');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockBuffer.buffer,
    } as any);

    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    const result = await synthesizeSpeech('Hola, soy Jarvis.');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws when ElevenLabs returns error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as any);

    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    await expect(synthesizeSpeech('test')).rejects.toThrow('ElevenLabs error 401');
  });

  it('throws if env vars are missing', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    await expect(synthesizeSpeech('test')).rejects.toThrow('Missing ElevenLabs env vars');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/elevenlabs.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/elevenlabs'`

- [ ] **Step 3: Implementar src/lib/elevenlabs.ts**

```typescript
const BASE = 'https://api.elevenlabs.io/v1';

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error('Missing ElevenLabs env vars');

  const response = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.2 },
    }),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${msg}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/elevenlabs.test.ts
```

Expected: `PASS — 3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/elevenlabs.ts apps/jarvis/tests/lib/elevenlabs.test.ts
git commit -m "feat(jarvis): add ElevenLabs TTS wrapper with tests"
```

---

## Task 6: Command handler — Claude interpreta el texto

**Files:**
- Create: `apps/jarvis/src/lib/command-handler.ts`
- Create: `apps/jarvis/tests/lib/command-handler.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/command-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tienes 2 proyectos activos: BioDental y ObraTech.' }],
      }),
    },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([
    { id: 'HAT3X-001', client_id: 'biodental', order_raw: 'Web corporativa', status: 'running', created_at: '2026-05-28T10:00:00Z' },
    { id: 'HAT3X-002', client_id: 'obratech', order_raw: 'Agente de voz', status: 'pending', created_at: '2026-05-27T10:00:00Z' },
  ]),
  readClients: vi.fn().mockResolvedValue([
    { id: 'biodental', name: 'BioDental', sector: 'salud', notes: 'Pide actualizar precios', previous_projects: [] },
  ]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
}));

describe('command handler', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns a string response', async () => {
    const { handleCommand } = await import('@/lib/command-handler');
    const result = await handleCommand('¿qué proyectos tenemos activos?');
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('throws if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { handleCommand } = await import('@/lib/command-handler');
    await expect(handleCommand('test')).rejects.toThrow('Missing ANTHROPIC_API_KEY');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/command-handler.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/command-handler'`

- [ ] **Step 3: Implementar src/lib/command-handler.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readTasks, readClients, readPendingCheckpoints } from '@/lib/supabase';

const SYSTEM_PROMPT = `Eres Jarvis, el asistente ejecutivo de HAT3X — consultora especializada en IA.

Tu interlocutor es José, el fundador. Respondes en español, de forma concisa y directa — como un asistente ejecutivo real, no un chatbot.

Reglas:
- Máximo 2-3 frases. Si necesitas listar, 5 ítems como máximo.
- Nunca inventes datos. Si no tienes información, dilo exactamente.
- Tono profesional pero cercano. Sin "Por supuesto" ni "Claro que sí".
- Si hay checkpoints pendientes, mencionarlos al final.`;

export async function handleCommand(text: string): Promise<{ response: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const [tasks, clients, checkpoints] = await Promise.all([
    readTasks(),
    readClients(),
    readPendingCheckpoints(),
  ]);

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const context = [
    `TAREAS ACTIVAS (${activeTasks.length}):`,
    ...activeTasks.map((t) => `  - [${t.status}] ${t.id}: "${t.order_raw}" (cliente: ${t.client_id ?? 'interno'})`),
    ``,
    `TAREAS COMPLETADAS HISTÓRICAS: ${completedCount}`,
    ``,
    `CLIENTES (${clients.length}):`,
    ...clients.map((c) => `  - ${c.name} (${c.sector ?? 'sin sector'}): ${c.notes ?? 'sin notas'}`),
    ``,
    `CHECKPOINTS PENDIENTES DE APROBACIÓN: ${checkpoints.length}`,
    ...checkpoints.map((cp) => `  - ${cp.task_id}: "${cp.reason}"`),
  ].join('\n');

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: `${SYSTEM_PROMPT}\n\nCONTEXTO ACTUAL:\n${context}`,
    messages: [{ role: 'user', content: text }],
  });

  const first = message.content[0];
  if (first.type !== 'text') throw new Error('Unexpected response type from Claude');
  return { response: first.text };
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/command-handler.test.ts
```

Expected: `PASS — 2 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/command-handler.ts apps/jarvis/tests/lib/command-handler.test.ts
git commit -m "feat(jarvis): add Claude command handler with tests"
```

---

## Task 7: API Routes (transcribe, speak, command)

**Files:**
- Create: `apps/jarvis/src/app/api/transcribe/route.ts`
- Create: `apps/jarvis/src/app/api/speak/route.ts`
- Create: `apps/jarvis/src/app/api/command/route.ts`

- [ ] **Step 1: Crear api/transcribe/route.ts**

```typescript
// src/app/api/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }
    const buffer = Buffer.from(await audio.arrayBuffer());
    const text = await transcribeAudio(buffer, 'recording.webm');
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/transcribe]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear api/speak/route.ts**

```typescript
// src/app/api/speak/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/lib/elevenlabs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const audioBuffer = await synthesizeSpeech(body.text);
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/speak]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear api/command/route.ts**

```typescript
// src/app/api/command/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { handleCommand } from '@/lib/command-handler';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const result = await handleCommand(body.text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/command]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar API manualmente**

```bash
cd apps/jarvis
cp .env.local.example .env.local
# Rellenar .env.local con las keys reales
npm run dev
```

```bash
# En otra terminal
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"text":"qué proyectos tenemos activos"}'
```

Expected: `{"response":"Tienes X proyectos activos: ..."}`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/app/api/
git commit -m "feat(jarvis): add API routes — transcribe, speak, command"
```

---

## Task 8: Hook useVoiceInput

**Files:**
- Create: `apps/jarvis/src/hooks/use-voice-input.ts`

- [ ] **Step 1: Implementar use-voice-input.ts**

```typescript
// src/hooks/use-voice-input.ts
'use client';
import { useState, useRef, useCallback } from 'react';
import type { VoiceState } from '@/types/jarvis';

interface UseVoiceInputReturn {
  voiceState: VoiceState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      setVoiceState('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setVoiceState('idle');
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
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
  }, []);

  return { voiceState, startRecording, stopRecording, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/jarvis/src/hooks/use-voice-input.ts
git commit -m "feat(jarvis): add useVoiceInput hook — MediaRecorder state machine"
```

---

## Task 9: Hook useVoiceOutput

**Files:**
- Create: `apps/jarvis/src/hooks/use-voice-output.ts`

- [ ] **Step 1: Implementar use-voice-output.ts**

```typescript
// src/hooks/use-voice-output.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/jarvis/src/hooks/use-voice-output.ts
git commit -m "feat(jarvis): add useVoiceOutput hook — ElevenLabs audio queue"
```

---

## Task 10: Componentes UI

**Files:**
- Create: `apps/jarvis/src/components/jarvis-orb.tsx`
- Create: `apps/jarvis/src/components/voice-button.tsx`
- Create: `apps/jarvis/src/components/transcript.tsx`
- Create: `apps/jarvis/src/components/command-log.tsx`

- [ ] **Step 1: Crear jarvis-orb.tsx**

```tsx
// src/components/jarvis-orb.tsx
'use client';
import type { VoiceState } from '@/types/jarvis';

interface JarvisOrbProps { state: VoiceState }

export function JarvisOrb({ state }: JarvisOrbProps) {
  const gradient = {
    idle: 'from-violet-900 via-purple-800 to-indigo-900',
    listening: 'from-violet-600 via-purple-500 to-indigo-600',
    processing: 'from-indigo-700 via-blue-600 to-violet-700',
    speaking: 'from-purple-500 via-violet-400 to-indigo-500',
  }[state];

  const coreAnim = {
    idle: 'animate-orb-idle',
    listening: 'animate-orb-pulse',
    processing: '',
    speaking: 'animate-orb-pulse',
  }[state];

  const shadowColor = {
    idle: '#4c1d95',
    listening: '#7c3aed',
    processing: '#1d4ed8',
    speaking: '#a855f7',
  }[state];

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {state === 'listening' && (
        <>
          <div className="absolute w-48 h-48 rounded-full border border-violet-500/40 animate-ring-1" />
          <div className="absolute w-48 h-48 rounded-full border border-violet-400/30 animate-ring-2" />
          <div className="absolute w-48 h-48 rounded-full border border-violet-300/20 animate-ring-3" />
        </>
      )}
      {state === 'processing' && (
        <div className="absolute w-44 h-44 rounded-full border-2 border-transparent border-t-blue-400 border-r-violet-400 animate-spin-slow" />
      )}
      <div
        className={`relative w-36 h-36 rounded-full bg-gradient-to-br ${gradient} ${coreAnim} flex items-center justify-center transition-all duration-300`}
        style={{ boxShadow: `0 0 60px ${shadowColor}80, 0 0 20px ${shadowColor}40` }}
      >
        <div className="text-white/80 text-xs font-mono tracking-widest select-none">
          {state === 'idle' && 'JARVIS'}
          {state === 'listening' && (
            <span className="flex gap-1 items-end h-6">
              {[0, 100, 200, 300, 400].map((delay) => (
                <span
                  key={delay}
                  className="w-1 bg-white/90 rounded animate-bounce"
                  style={{ height: `${12 + (delay % 300 === 0 ? 8 : delay % 200 === 0 ? 4 : 0)}px`, animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          )}
          {state === 'processing' && <span className="animate-pulse">···</span>}
          {state === 'speaking' && '◈'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Crear voice-button.tsx**

```tsx
// src/components/voice-button.tsx
'use client';
import type { VoiceState } from '@/types/jarvis';

interface VoiceButtonProps {
  voiceState: VoiceState;
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
}

export function VoiceButton({ voiceState, onPressStart, onPressEnd, disabled }: VoiceButtonProps) {
  const isActive = voiceState === 'listening';
  const isDisabled = disabled || voiceState === 'processing' || voiceState === 'speaking';

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onTouchStart={(e) => { e.preventDefault(); onPressStart(); }}
        onTouchEnd={(e) => { e.preventDefault(); onPressEnd(); }}
        disabled={isDisabled}
        aria-label={isActive ? 'Suelta para enviar' : 'Mantén pulsado para hablar'}
        className={[
          'w-20 h-20 rounded-full transition-all duration-150 select-none',
          'flex items-center justify-center text-3xl',
          isActive
            ? 'bg-violet-600 scale-110 shadow-lg shadow-violet-500/50 ring-4 ring-violet-400/40'
            : 'bg-jarvis-surface border border-jarvis-border hover:border-violet-600/50',
          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95',
        ].join(' ')}
      >
        🎙
      </button>
      <span className="text-jarvis-muted text-xs font-mono">
        {voiceState === 'idle' && 'mantén para hablar'}
        {voiceState === 'listening' && 'escuchando...'}
        {voiceState === 'processing' && 'procesando...'}
        {voiceState === 'speaking' && 'Jarvis responde...'}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Crear transcript.tsx**

```tsx
// src/components/transcript.tsx
'use client';

interface TranscriptProps {
  userText: string;
  jarvisResponse: string;
  isLoading: boolean;
}

export function Transcript({ userText, jarvisResponse, isLoading }: TranscriptProps) {
  if (!userText && !jarvisResponse && !isLoading) return null;

  return (
    <div className="w-full max-w-lg space-y-3">
      {userText && (
        <div className="flex justify-end">
          <div className="bg-jarvis-surface border border-jarvis-border rounded-2xl rounded-tr-sm px-4 py-2 max-w-xs">
            <p className="text-jarvis-text text-sm">{userText}</p>
          </div>
        </div>
      )}
      {(jarvisResponse || isLoading) && (
        <div className="flex justify-start">
          <div className="bg-violet-950/50 border border-violet-800/30 rounded-2xl rounded-tl-sm px-4 py-2 max-w-sm">
            {isLoading ? (
              <div className="flex gap-1 items-center py-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            ) : (
              <p className="text-jarvis-text text-sm">{jarvisResponse}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Crear command-log.tsx**

```tsx
// src/components/command-log.tsx
'use client';
import type { CommandEntry } from '@/types/jarvis';

interface CommandLogProps { entries: CommandEntry[] }

export function CommandLog({ entries }: CommandLogProps) {
  if (entries.length === 0) return null;

  return (
    <div className="w-full max-w-lg">
      <p className="text-jarvis-muted text-xs font-mono mb-2 uppercase tracking-wider">Sesión actual</p>
      <div className="space-y-2 max-h-36 overflow-y-auto">
        {[...entries].reverse().map((entry) => (
          <div key={entry.id} className="border-l-2 border-jarvis-border pl-3 py-1">
            <p className="text-jarvis-muted text-xs truncate">› {entry.userText}</p>
            <p className="text-jarvis-text text-xs line-clamp-2">{entry.jarvisResponse}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/components/
git commit -m "feat(jarvis): add UI components — orb, voice button, transcript, log"
```

---

## Task 11: Layout, globals.css y página principal

**Files:**
- Create: `apps/jarvis/src/app/globals.css`
- Create: `apps/jarvis/src/app/layout.tsx`
- Create: `apps/jarvis/src/app/page.tsx`

- [ ] **Step 1: Crear globals.css**

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

html, body {
  background: #040810;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100dvh;
  overscroll-behavior: none;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #0a1020; }
::-webkit-scrollbar-thumb { background: #1a2540; border-radius: 2px; }
```

- [ ] **Step 2: Crear layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jarvis — HAT3X',
  description: 'Asistente ejecutivo de voz',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Jarvis' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#7c3aed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Crear page.tsx — orquesta todo**

```tsx
// src/app/page.tsx
'use client';
import { useState, useCallback, useId } from 'react';
import { JarvisOrb } from '@/components/jarvis-orb';
import { VoiceButton } from '@/components/voice-button';
import { Transcript } from '@/components/transcript';
import { CommandLog } from '@/components/command-log';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useVoiceOutput } from '@/hooks/use-voice-output';
import type { CommandEntry, VoiceState } from '@/types/jarvis';

export default function JarvisPage() {
  const idPrefix = useId();
  const [commandLog, setCommandLog] = useState<CommandEntry[]>([]);
  const [currentUserText, setCurrentUserText] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeakingOverride, setIsSpeakingOverride] = useState(false);

  const { voiceState, startRecording, stopRecording, error } = useVoiceInput();
  const { speak } = useVoiceOutput((speaking) => setIsSpeakingOverride(speaking));

  const effectiveState: VoiceState = isSpeakingOverride ? 'speaking' : voiceState;

  const handlePressStart = useCallback(async () => {
    setCurrentUserText('');
    setCurrentResponse('');
    await startRecording();
  }, [startRecording]);

  const handlePressEnd = useCallback(async () => {
    const blob = await stopRecording();
    // Ignorar si el audio es demasiado corto (< 1KB)
    if (!blob || blob.size < 1000) { return; }

    setIsLoading(true);
    try {
      // 1. Transcribir audio
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const { text } = await transcribeRes.json() as { text: string };
      setCurrentUserText(text);

      // 2. Procesar con Claude
      const commandRes = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const { response } = await commandRes.json() as { response: string };
      setCurrentResponse(response);
      setIsLoading(false);

      // 3. Responder con voz
      await speak(response);

      // 4. Guardar en historial de sesión
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
      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <span className="text-jarvis-muted text-xs font-mono uppercase tracking-widest">HAT3X</span>
        <span className="text-jarvis-muted text-xs font-mono">
          {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      {/* Zona central — Orb + Transcripción */}
      <div className="flex flex-col items-center gap-8">
        <JarvisOrb state={effectiveState} />
        <Transcript userText={currentUserText} jarvisResponse={currentResponse} isLoading={isLoading} />
        {error && <p className="text-red-400 text-xs text-center max-w-xs">{error}</p>}
        <VoiceButton
          voiceState={effectiveState}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
          disabled={isLoading}
        />
      </div>

      {/* Historial de sesión */}
      <CommandLog entries={commandLog} />
    </main>
  );
}
```

- [ ] **Step 4: Arrancar servidor y verificar flujo completo**

```bash
cd apps/jarvis && npm run dev
```

Abrir `http://localhost:3001`. Verificar:
- [ ] Fondo negro `#040810`, orb visible con animación idle lenta
- [ ] Al mantener pulsado el botón: orb cambia a estado `listening` con anillos
- [ ] Al soltar: estado `processing` con anillo giratorio
- [ ] El texto transcrito aparece como burbuja de usuario
- [ ] La respuesta de Jarvis aparece como burbuja de respuesta
- [ ] ElevenLabs reproduce el audio (orb cambia a estado `speaking`)
- [ ] El comando queda en el historial inferior
- [ ] No hay errores en la consola del navegador

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/app/
git commit -m "feat(jarvis): complete main page — voice in/out working end-to-end"
```

---

## Task 12: Suite de tests y build de producción

**Files:** ninguno nuevo

- [ ] **Step 1: Ejecutar suite completa**

```bash
cd apps/jarvis && npx vitest run
```

Expected: `PASS — 11 tests passed` (4 supabase + 2 whisper + 3 elevenlabs + 2 command-handler)

- [ ] **Step 2: Build de producción**

```bash
cd apps/jarvis && npm run build
```

Expected: sin errores TypeScript ni build errors.

- [ ] **Step 3: Instalar como PWA en móvil**

Conectar el móvil a la misma red WiFi. En Windows, obtener la IP local:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object IPAddress
```

Iniciar en modo red local:

```bash
# Modificar package.json scripts.dev temporalmente:
# "dev": "next dev -p 3001 -H 0.0.0.0"
cd apps/jarvis && npm run dev
```

En el móvil, abrir `http://192.168.X.X:3001`:
- **iOS Safari**: botón compartir → "Añadir a pantalla de inicio"
- **Android Chrome**: menú → "Instalar app" o "Añadir a pantalla de inicio"

Verificar que la app se abre en modo standalone (sin barra de navegador).

- [ ] **Step 4: Commit final del plan**

```bash
git add -A
git commit -m "feat(jarvis): Plan 8 complete — Jarvis PWA voice interface working on mobile and desktop"
```

---

## Verificación final del plan vs requisitos

| Requisito | Tarea |
|---|---|
| PWA instalable móvil y escritorio | Task 1 (next-pwa), Task 12 |
| Voz in (hold-to-talk) | Task 8 (hook), Task 10 (button), Task 11 (page) |
| Transcripción Whisper (español) | Task 4, Task 7 |
| Respuesta ElevenLabs (voz Jarvis) | Task 5, Task 9 |
| Consultas básicas a Supabase | Task 3 |
| Claude interpreta comandos en contexto | Task 6 |
| Orb animado con 4 estados | Task 10 |
| Historial de sesión | Task 10 (log), Task 11 (page) |
| Tests unitarios para toda la capa lib/ | Tasks 3, 4, 5, 6 |
| Sin dependencia de Telegram ni terceros | ✅ Todo en apps/jarvis/ aislado |
