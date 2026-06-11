# HAT3X Command — Plan 9: Jarvis Intent Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerrequisito:** Plan 8 completado y funcionando (`apps/jarvis/` con voz in/out operativa).

**Goal:** Jarvis entiende intenciones contextuales y actúa automáticamente — "la clínica Biodental nos ha pedido X" crea una tarea y actualiza la memoria del cliente sin comandos explícitos.

**Architecture:** Un `IntentParser` clasifica cada texto en: `query` (solo lectura), `create_task` (tarea nueva en Supabase), `update_client` (actualizar notas del cliente) o `general` (conversación libre). La API route `/api/command` delega siempre al intent router — el cliente no necesita saber el tipo de acción. Toda escritura ocurre en el servidor con la service role key.

**Tech Stack:** Igual que Plan 8. Se añade `intent-parser.ts` (Claude Haiku para clasificación rápida), `intent-handler.ts` (ejecuta la acción) y funciones de escritura en `supabase.ts`.

---

## File Map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `apps/jarvis/src/types/jarvis.ts` | Modificar | Añadir IntentType, IntentResult, ActionResult |
| `apps/jarvis/src/lib/intent-parser.ts` | Crear | Claude Haiku clasifica texto → IntentResult JSON |
| `apps/jarvis/src/lib/supabase.ts` | Modificar | Añadir createTask() y updateClientNotes() |
| `apps/jarvis/src/lib/intent-handler.ts` | Crear | Ejecuta acción según IntentResult → ActionResult |
| `apps/jarvis/src/app/api/intent/route.ts` | Crear | POST: `{ text }` → intent + action (expuesto para debug) |
| `apps/jarvis/src/app/api/command/route.ts` | Modificar | Delegar a intent parser en vez de llamar a command-handler directamente |
| `apps/jarvis/src/components/transcript.tsx` | Modificar | Mostrar badge de acción realizada |
| `apps/jarvis/src/app/page.tsx` | Modificar | Pasar action al Transcript |
| `apps/jarvis/tests/lib/intent-parser.test.ts` | Crear | 5 tests de clasificación |
| `apps/jarvis/tests/lib/supabase-write.test.ts` | Crear | 4 tests de escritura a Supabase |
| `apps/jarvis/tests/lib/intent-handler.test.ts` | Crear | 4 tests de ejecución de acciones |

---

## Task 1: Tipos de intención

**Files:**
- Modify: `apps/jarvis/src/types/jarvis.ts`

- [ ] **Step 1: Añadir tipos al final de jarvis.ts**

```typescript
// Añadir al final de src/types/jarvis.ts

export type IntentType = 'query' | 'create_task' | 'update_client' | 'general';

export interface IntentResult {
  type: IntentType;
  confidence: 'high' | 'medium' | 'low';
  taskDescription?: string;
  clientId?: string;
  clientName?: string;
  newNotes?: string;
  queryText?: string;
}

export interface ActionResult {
  response: string;
  action?: {
    type: IntentType;
    entityId?: string;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/jarvis/src/types/jarvis.ts
git commit -m "feat(jarvis): add intent types"
```

---

## Task 2: Intent Parser — Claude Haiku clasifica la intención

**Files:**
- Create: `apps/jarvis/src/lib/intent-parser.ts`
- Create: `apps/jarvis/tests/lib/intent-parser.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/intent-parser.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

describe('intent parser', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('classifies "qué proyectos tenemos" as query', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ type: 'query', confidence: 'high', queryText: 'qué proyectos tenemos activos' }) }],
        }),
      },
    } as any));
    const { parseIntent } = await import('@/lib/intent-parser');
    const result = await parseIntent('qué proyectos tenemos activos');
    expect(result.type).toBe('query');
  });

  it('classifies "biodental nos ha pedido modificación" as create_task', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ type: 'create_task', confidence: 'high', taskDescription: 'Modificación web BioDental', clientId: 'biodental' }) }],
        }),
      },
    } as any));
    const { parseIntent } = await import('@/lib/intent-parser');
    const result = await parseIntent('la clínica biodental nos ha pedido una modificación en la web');
    expect(result.type).toBe('create_task');
    expect(result.clientId).toBe('biodental');
  });

  it('classifies "apunta que X quiere Y" as update_client', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ type: 'update_client', confidence: 'high', clientName: 'BioDental', newNotes: 'Quiere chat en la web' }) }],
        }),
      },
    } as any));
    const { parseIntent } = await import('@/lib/intent-parser');
    const result = await parseIntent('apunta que biodental quiere añadir chat en la web');
    expect(result.type).toBe('update_client');
    expect(result.clientName).toBe('BioDental');
  });

  it('returns general for ambiguous input', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ type: 'general', confidence: 'low' }) }],
        }),
      },
    } as any));
    const { parseIntent } = await import('@/lib/intent-parser');
    const result = await parseIntent('hola buenos días');
    expect(result.type).toBe('general');
  });

  it('falls back to general when Claude returns invalid JSON', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'not valid json at all' }],
        }),
      },
    } as any));
    const { parseIntent } = await import('@/lib/intent-parser');
    const result = await parseIntent('texto ambiguo');
    expect(result.type).toBe('general');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/intent-parser.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/intent-parser'`

- [ ] **Step 3: Implementar src/lib/intent-parser.ts**

```typescript
// src/lib/intent-parser.ts
import Anthropic from '@anthropic-ai/sdk';
import type { IntentResult } from '@/types/jarvis';

const SYSTEM = `Eres un clasificador de intenciones para Jarvis (asistente de HAT3X consultora de IA).

Devuelve SOLO un objeto JSON. Sin explicaciones ni texto adicional.

Tipos:
- "query": consultar información (proyectos, clientes, tareas, estado, listados)
- "create_task": un cliente ha pedido algo, hay trabajo nuevo, crear tarea
- "update_client": apuntar información sobre un cliente (notas, peticiones, cambios)
- "general": saludos, preguntas fuera de contexto, o nada de lo anterior

Schema JSON:
{
  "type": "query" | "create_task" | "update_client" | "general",
  "confidence": "high" | "medium" | "low",
  "taskDescription": "descripción de la tarea (solo create_task)",
  "clientId": "nombre-cliente-en-minusculas-sin-espacios (solo create_task si se menciona cliente)",
  "clientName": "nombre del cliente (solo update_client)",
  "newNotes": "información a apuntar (solo update_client)",
  "queryText": "texto de consulta limpio (solo query)"
}

Incluye solo los campos relevantes al tipo detectado.`;

export async function parseIntent(text: string): Promise<IntentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    });

    const first = message.content[0];
    if (first.type !== 'text') return { type: 'general', confidence: 'low' };

    const jsonMatch = first.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { type: 'general', confidence: 'low' };

    return JSON.parse(jsonMatch[0]) as IntentResult;
  } catch {
    return { type: 'general', confidence: 'low' };
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/intent-parser.test.ts
```

Expected: `PASS — 5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/intent-parser.ts apps/jarvis/tests/lib/intent-parser.test.ts
git commit -m "feat(jarvis): add intent parser with Claude Haiku"
```

---

## Task 3: Funciones de escritura en Supabase

**Files:**
- Modify: `apps/jarvis/src/lib/supabase.ts`
- Create: `apps/jarvis/tests/lib/supabase-write.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/supabase-write.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('supabase write operations', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('createTask returns an id starting with HAT3X-', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({ insert: () => Promise.resolve({ error: null }) }),
    } as any);
    const { createTask } = await import('@/lib/supabase');
    const id = await createTask({ description: 'Actualizar precios BioDental', clientId: 'biodental' });
    expect(id.startsWith('HAT3X-')).toBe(true);
  });

  it('createTask throws on Supabase error', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({ insert: () => Promise.resolve({ error: { message: 'insert failed' } }) }),
    } as any);
    const { createTask } = await import('@/lib/supabase');
    await expect(createTask({ description: 'test', clientId: null })).rejects.toThrow('insert failed');
  });

  it('updateClientNotes appends note to existing notes', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValue({
      from: (_table: string) => ({
        select: () => ({ ilike: () => Promise.resolve({ data: [{ id: 'biodental', notes: 'Nota anterior' }], error: null }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    } as any);
    const { updateClientNotes } = await import('@/lib/supabase');
    await expect(updateClientNotes({ clientName: 'BioDental', newNotes: 'Quiere chat' })).resolves.not.toThrow();
  });

  it('updateClientNotes throws if client not found', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValue({
      from: () => ({
        select: () => ({ ilike: () => Promise.resolve({ data: [], error: null }) }),
      }),
    } as any);
    const { updateClientNotes } = await import('@/lib/supabase');
    await expect(updateClientNotes({ clientName: 'Inexistente', newNotes: 'algo' })).rejects.toThrow('Client not found');
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/supabase-write.test.ts
```

Expected: `FAIL — createTask is not a function`

- [ ] **Step 3: Añadir funciones al final de supabase.ts**

```typescript
// Añadir al final de src/lib/supabase.ts

interface CreateTaskInput {
  description: string;
  clientId: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const id = `HAT3X-${Date.now()}`;
  const { error } = await getClient()
    .from('hat3x_tasks')
    .insert({
      id,
      client_id: input.clientId,
      order_raw: input.description,
      status: 'pending',
      control_mode: 'phased',
    });
  if (error) throw new Error(error.message);
  return id;
}

interface UpdateClientNotesInput {
  clientName: string;
  newNotes: string;
}

export async function updateClientNotes(input: UpdateClientNotesInput): Promise<void> {
  const { data, error: selectError } = await getClient()
    .from('hat3x_clients')
    .select('id, notes')
    .ilike('name', `%${input.clientName}%`);

  if (selectError) throw new Error(selectError.message);
  if (!data || data.length === 0) throw new Error(`Client not found: ${input.clientName}`);

  const existing = data[0] as { id: string; notes: string | null };
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const updatedNotes = existing.notes
    ? `${existing.notes}\n[${date}] ${input.newNotes}`
    : `[${date}] ${input.newNotes}`;

  const { error: updateError } = await getClient()
    .from('hat3x_clients')
    .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (updateError) throw new Error(updateError.message);
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/supabase-write.test.ts
```

Expected: `PASS — 4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/supabase.ts apps/jarvis/tests/lib/supabase-write.test.ts
git commit -m "feat(jarvis): add createTask and updateClientNotes to Supabase bridge"
```

---

## Task 4: Intent Handler

**Files:**
- Create: `apps/jarvis/src/lib/intent-handler.ts`
- Create: `apps/jarvis/tests/lib/intent-handler.test.ts`

- [ ] **Step 1: Escribir test primero**

```typescript
// tests/lib/intent-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/command-handler', () => ({
  handleCommand: vi.fn().mockResolvedValue({ response: 'Tienes 2 proyectos activos.' }),
}));

vi.mock('@/lib/supabase', () => ({
  createTask: vi.fn().mockResolvedValue('HAT3X-001'),
  updateClientNotes: vi.fn().mockResolvedValue(undefined),
}));

describe('intent handler', () => {
  beforeEach(() => { vi.resetModules(); });

  it('query intent delegates to command handler', async () => {
    const { executeIntent } = await import('@/lib/intent-handler');
    const result = await executeIntent({ type: 'query', confidence: 'high', queryText: 'proyectos activos' });
    expect(result.response).toBe('Tienes 2 proyectos activos.');
    expect(result.action?.type).toBe('query');
  });

  it('create_task intent calls createTask and returns confirmation with ID', async () => {
    const { executeIntent } = await import('@/lib/intent-handler');
    const result = await executeIntent({ type: 'create_task', confidence: 'high', taskDescription: 'Actualizar precios', clientId: 'biodental' });
    expect(result.response).toContain('HAT3X-001');
    expect(result.action?.entityId).toBe('HAT3X-001');
  });

  it('update_client intent calls updateClientNotes and returns confirmation', async () => {
    const { executeIntent } = await import('@/lib/intent-handler');
    const result = await executeIntent({ type: 'update_client', confidence: 'high', clientName: 'BioDental', newNotes: 'Quiere chat' });
    expect(result.response).toContain('BioDental');
    expect(result.action?.type).toBe('update_client');
  });

  it('general intent returns fallback message', async () => {
    const { executeIntent } = await import('@/lib/intent-handler');
    const result = await executeIntent({ type: 'general', confidence: 'low' });
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/jarvis && npx vitest run tests/lib/intent-handler.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/intent-handler'`

- [ ] **Step 3: Implementar src/lib/intent-handler.ts**

```typescript
// src/lib/intent-handler.ts
import { handleCommand } from '@/lib/command-handler';
import { createTask, updateClientNotes } from '@/lib/supabase';
import type { IntentResult, ActionResult } from '@/types/jarvis';

export async function executeIntent(intent: IntentResult): Promise<ActionResult> {
  switch (intent.type) {
    case 'query': {
      const { response } = await handleCommand(intent.queryText ?? '');
      return { response, action: { type: 'query' } };
    }

    case 'create_task': {
      if (!intent.taskDescription) {
        return { response: 'No entendí bien la tarea. ¿Puedes darme más detalle?' };
      }
      const taskId = await createTask({ description: intent.taskDescription, clientId: intent.clientId ?? null });
      const clientSuffix = intent.clientId ? ` para ${intent.clientId}` : '';
      return {
        response: `Creado. Tarea ${taskId}${clientSuffix}: "${intent.taskDescription}". Queda en cola como pendiente.`,
        action: { type: 'create_task', entityId: taskId },
      };
    }

    case 'update_client': {
      if (!intent.clientName || !intent.newNotes) {
        return { response: 'No identifiqué el cliente o la información a guardar. ¿Puedes repetirlo?' };
      }
      await updateClientNotes({ clientName: intent.clientName, newNotes: intent.newNotes });
      return {
        response: `Apuntado en la ficha de ${intent.clientName}: "${intent.newNotes}".`,
        action: { type: 'update_client', entityId: intent.clientName },
      };
    }

    default:
      return { response: '¿En qué más puedo ayudarte?', action: { type: 'general' } };
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

```bash
cd apps/jarvis && npx vitest run tests/lib/intent-handler.test.ts
```

Expected: `PASS — 4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/jarvis/src/lib/intent-handler.ts apps/jarvis/tests/lib/intent-handler.test.ts
git commit -m "feat(jarvis): add intent handler — routes intent to action"
```

---

## Task 5: API routes y actualizar page.tsx

**Files:**
- Create: `apps/jarvis/src/app/api/intent/route.ts`
- Modify: `apps/jarvis/src/app/api/command/route.ts`
- Modify: `apps/jarvis/src/components/transcript.tsx`
- Modify: `apps/jarvis/src/app/page.tsx`

- [ ] **Step 1: Crear api/intent/route.ts (endpoint de debug)**

```typescript
// src/app/api/intent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parseIntent } from '@/lib/intent-parser';
import { executeIntent } from '@/lib/intent-handler';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const intent = await parseIntent(body.text);
    const result = await executeIntent(intent);
    return NextResponse.json({ ...result, intent });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Reemplazar api/command/route.ts para usar el intent router**

```typescript
// src/app/api/command/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parseIntent } from '@/lib/intent-parser';
import { executeIntent } from '@/lib/intent-handler';
import type { ActionResult } from '@/types/jarvis';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const intent = await parseIntent(body.text);
    const result: ActionResult = await executeIntent(intent);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/command]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Actualizar transcript.tsx para mostrar badge de acción**

```tsx
// src/components/transcript.tsx
'use client';
import type { ActionResult } from '@/types/jarvis';

interface TranscriptProps {
  userText: string;
  jarvisResponse: string;
  action?: ActionResult['action'];
  isLoading: boolean;
}

const ACTION_BADGE: Partial<Record<string, string>> = {
  create_task: '✓ Tarea creada',
  update_client: '✓ Ficha actualizada',
};

export function Transcript({ userText, jarvisResponse, action, isLoading }: TranscriptProps) {
  if (!userText && !jarvisResponse && !isLoading) return null;
  const badge = action ? ACTION_BADGE[action.type] : undefined;

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
              <>
                <p className="text-jarvis-text text-sm">{jarvisResponse}</p>
                {badge && <p className="text-violet-400 text-xs mt-1 font-mono">{badge}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Actualizar page.tsx para pasar action al Transcript**

En `apps/jarvis/src/app/page.tsx`, hacer los siguientes cambios:

**4a. Añadir import de ActionResult:**
```tsx
// Cambiar:
import type { CommandEntry, VoiceState } from '@/types/jarvis';
// Por:
import type { CommandEntry, VoiceState, ActionResult } from '@/types/jarvis';
```

**4b. Añadir estado currentAction junto a los otros useState:**
```tsx
const [currentAction, setCurrentAction] = useState<ActionResult['action'] | undefined>(undefined);
```

**4c. En handlePressEnd, actualizar la llamada al API para extraer action:**
```tsx
// Cambiar:
const { response } = await commandRes.json() as { response: string };
setCurrentResponse(response);
// Por:
const result = await commandRes.json() as ActionResult;
setCurrentResponse(result.response);
setCurrentAction(result.action);
```

**4d. Limpiar currentAction en handlePressStart:**
```tsx
// Añadir al inicio de handlePressStart:
setCurrentAction(undefined);
```

**4e. Pasar action al Transcript:**
```tsx
// Cambiar:
<Transcript userText={currentUserText} jarvisResponse={currentResponse} isLoading={isLoading} />
// Por:
<Transcript userText={currentUserText} jarvisResponse={currentResponse} action={currentAction} isLoading={isLoading} />
```

- [ ] **Step 5: Verificar manualmente con curl**

```bash
cd apps/jarvis && npm run dev
```

```bash
# Crear tarea via voz
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"text":"la clínica biodental nos ha pedido actualizar la sección de precios de su web"}'
# Expected: {"response":"Creado. Tarea HAT3X-XXX para biodental: ...","action":{"type":"create_task","entityId":"HAT3X-XXX"}}

# Actualizar cliente
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"text":"apunta que biodental quiere añadir un chat de WhatsApp a su web"}'
# Expected: {"response":"Apuntado en la ficha de BioDental: ...","action":{"type":"update_client"}}

# Query normal
curl -X POST http://localhost:3001/api/command \
  -H "Content-Type: application/json" \
  -d '{"text":"cuántos proyectos activos tenemos"}'
# Expected: {"response":"Tienes X proyectos activos...","action":{"type":"query"}}
```

- [ ] **Step 6: Commit**

```bash
git add apps/jarvis/src/app/api/ apps/jarvis/src/components/transcript.tsx apps/jarvis/src/app/page.tsx
git commit -m "feat(jarvis): wire intent engine into command route and UI feedback"
```

---

## Task 6: Suite completa y verificación final

**Files:** ninguno nuevo

- [ ] **Step 1: Ejecutar todos los tests**

```bash
cd apps/jarvis && npx vitest run
```

Expected: `PASS — 26 tests passed`
(11 del Plan 8 + 5 intent-parser + 4 supabase-write + 4 intent-handler + 2 command-handler)

- [ ] **Step 2: Build de producción**

```bash
cd apps/jarvis && npm run build
```

Expected: sin errores TypeScript.

- [ ] **Step 3: Test de flujo completo manual**

| Comando de voz | Intención esperada | Verificar en Supabase |
|---|---|---|
| "¿Qué proyectos tenemos activos?" | query | No hay cambios en DB |
| "La clínica Biodental nos ha pedido añadir un blog" | create_task | Nueva fila en `hat3x_tasks` |
| "Apunta que 100 Montaditos quiere Google Analytics" | update_client | Campo `notes` actualizado en `hat3x_clients` |
| "ObraTech nos ha pedido acceso al portal del cliente" | create_task | Nueva fila en `hat3x_tasks` |

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(jarvis): Plan 9 complete — contextual intent engine with auto task creation"
```

---

## Verificación final del plan vs requisitos

| Requisito | Tarea |
|---|---|
| "Biodental nos ha pedido X" → crea tarea automáticamente | Tasks 2, 4, 5 |
| "Apunta que X quiere Y" → actualiza ficha del cliente | Tasks 3, 4, 5 |
| Queries siguen funcionando sin cambios | Task 5 (/api/command interfaz igual) |
| Badge visual de acción realizada en la UI | Task 5 (transcript.tsx) |
| Tests unitarios para toda la nueva lógica | Tasks 2, 3, 4 |
| Sin breaking changes del Plan 8 | ✅ /api/command mantiene misma interfaz |
