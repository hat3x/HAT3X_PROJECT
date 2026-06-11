# Jarvis Financial Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Jarvis to record income/expenses and query financial summaries by voice, using Claude tool use to detect financial intents.

**Architecture:** New `hat3x_transactions` Supabase table. `src/lib/finance.ts` centralises all DB read/write. `command-handler.ts` upgraded to Claude tool use — Claude decides when to call `record_transaction` or `query_finances` tools. Page renders a `FinanceBadge` when a transaction is confirmed or a summary is returned.

**Tech Stack:** Supabase (Postgres), Claude tool use (`@anthropic-ai/sdk`), Vitest, Next.js 14 App Router, Tailwind CSS v3, TypeScript strict.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/command/src/database/migrations/003_transactions.sql` | Supabase migration — transactions table |
| Modify | `apps/jarvis/src/types/jarvis.ts` | Add DbTransaction, TransactionCategory, FinancialSummary, CommandResult, TransactionAction |
| Create | `apps/jarvis/src/lib/finance.ts` | recordTransaction, queryFinances, getCurrentMonthSummary |
| Create | `apps/jarvis/tests/lib/finance.test.ts` | TDD tests for finance.ts |
| Modify | `apps/jarvis/src/lib/command-handler.ts` | Claude tool use, returns CommandResult |
| Modify | `apps/jarvis/tests/lib/command-handler.test.ts` | Tests for CommandResult + tool use |
| Create | `apps/jarvis/src/components/finance-badge.tsx` | Confirmation / summary UI card |
| Modify | `apps/jarvis/src/app/page.tsx` | Wire action state, render FinanceBadge |

---

### Task 1: DB Migration — hat3x_transactions

**Files:**
- Create: `apps/command/src/database/migrations/003_transactions.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 003_transactions.sql
CREATE TABLE IF NOT EXISTS hat3x_transactions (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN (
    'cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'
  )),
  client_id   TEXT        REFERENCES hat3x_clients(id) ON DELETE SET NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date       ON hat3x_transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON hat3x_transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON hat3x_transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_client_id  ON hat3x_transactions (client_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

  Go to Supabase Dashboard → SQL Editor → paste the file content → Run.
  Expected: table `hat3x_transactions` created, 4 indexes created.

- [ ] **Step 3: Commit**

```bash
git add apps/command/src/database/migrations/003_transactions.sql
git commit -m "feat(db): add hat3x_transactions table with indexes"
```

---

### Task 2: Types

**Files:**
- Modify: `apps/jarvis/src/types/jarvis.ts`

- [ ] **Step 1: Read the current file**

Open `apps/jarvis/src/types/jarvis.ts`. Current content:

```typescript
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface CommandEntry {
  id: string;
  userText: string;
  jarvisResponse: string;
  timestamp: Date;
}

export interface DbTask {
  id: string;
  client_id: string | null;
  order_raw: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
}

export interface DbClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

export interface DbCheckpoint {
  id: string;
  task_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  triggered_at: string;
}
```

- [ ] **Step 2: Replace with extended version**

Replace the entire file content with:

```typescript
export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export type TransactionCategory =
  | 'cliente'
  | 'otro'
  | 'herramientas_saas'
  | 'personal'
  | 'marketing'
  | 'infraestructura';

export interface CommandEntry {
  id: string;
  userText: string;
  jarvisResponse: string;
  timestamp: Date;
}

export interface DbTask {
  id: string;
  client_id: string | null;
  order_raw: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  created_at: string;
}

export interface DbClient {
  id: string;
  name: string;
  sector: string | null;
  notes: string | null;
  previous_projects: string[];
}

export interface DbCheckpoint {
  id: string;
  task_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  triggered_at: string;
}

export interface DbTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: TransactionCategory;
  client_id: string | null;
  date: string;
  created_at: string;
}

export interface RecordTransactionInput {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: TransactionCategory;
  client_id?: string | null;
  date?: string;
}

export interface FinancialSummary {
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  margin: number;
  byCategory: {
    category: string;
    type: 'income' | 'expense';
    total: number;
    count: number;
  }[];
  recentTransactions: DbTransaction[];
}

export interface TransactionAction {
  type: 'transaction_recorded';
  transaction: DbTransaction;
}

export interface SummaryAction {
  type: 'financial_summary';
  summary: FinancialSummary;
}

export type CommandAction = TransactionAction | SummaryAction;

export interface CommandResult {
  response: string;
  action?: CommandAction;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/jarvis && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/jarvis/src/types/jarvis.ts
git commit -m "feat(types): add financial types to jarvis.ts"
```

---

### Task 3: finance.ts (TDD)

**Files:**
- Create: `apps/jarvis/tests/lib/finance.test.ts`
- Create: `apps/jarvis/src/lib/finance.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/jarvis/tests/lib/finance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '@/lib/supabase';
import { recordTransaction, queryFinances } from '@/lib/finance';
import type { RecordTransactionInput, DbTransaction, FinancialSummary } from '@/types/jarvis';

const mockTransaction: DbTransaction = {
  id: 'txn-1',
  type: 'income',
  amount: 1500,
  description: 'Proyecto web NovaMed',
  category: 'cliente',
  client_id: 'client-1',
  date: '2026-05-01',
  created_at: '2026-05-01T10:00:00Z',
};

describe('recordTransaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a transaction and returns it', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockTransaction, error: null }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const input: RecordTransactionInput = {
      type: 'income',
      amount: 1500,
      description: 'Proyecto web NovaMed',
      category: 'cliente',
      client_id: 'client-1',
    };

    const result = await recordTransaction(input);
    expect(result).toEqual(mockTransaction);
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_transactions');
  });

  it('throws when Supabase returns an error', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    await expect(
      recordTransaction({ type: 'expense', amount: 50, description: 'Café', category: 'personal' })
    ).rejects.toThrow('DB error');
  });
});

describe('queryFinances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a FinancialSummary for the current month', async () => {
    const rows: DbTransaction[] = [
      { ...mockTransaction, type: 'income', amount: 2000, category: 'cliente' },
      { ...mockTransaction, id: 'txn-2', type: 'expense', amount: 500, category: 'herramientas_saas' },
    ];
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const result: FinancialSummary = await queryFinances();
    expect(result.totalIncome).toBe(2000);
    expect(result.totalExpense).toBe(500);
    expect(result.margin).toBe(1500);
    expect(result.byCategory).toHaveLength(2);
    expect(result.recentTransactions).toHaveLength(2);
  });

  it('throws when Supabase returns an error', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    await expect(queryFinances()).rejects.toThrow('Query failed');
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd apps/jarvis && npx vitest run tests/lib/finance.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/finance'`

- [ ] **Step 3: Check that supabase.ts exports getSupabaseClient**

Open `apps/jarvis/src/lib/supabase.ts`. If it doesn't export `getSupabaseClient`, add it at the top:

```typescript
import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}
```

Keep all existing exported functions (`readTasks`, `readClients`, `readPendingCheckpoints`) intact — refactor them to use `getSupabaseClient()` internally if they currently inline the client creation.

- [ ] **Step 4: Write the minimal implementation**

Create `apps/jarvis/src/lib/finance.ts`:

```typescript
import { getSupabaseClient } from '@/lib/supabase';
import type {
  DbTransaction,
  RecordTransactionInput,
  FinancialSummary,
  TransactionCategory,
} from '@/types/jarvis';

export async function recordTransaction(
  input: RecordTransactionInput
): Promise<DbTransaction> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('hat3x_transactions')
    .insert({
      type: input.type,
      amount: input.amount,
      description: input.description,
      category: input.category,
      client_id: input.client_id ?? null,
      date: input.date ?? new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DbTransaction;
}

export async function queryFinances(month?: number, year?: number): Promise<FinancialSummary> {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();

  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('hat3x_transactions')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as DbTransaction[];
  const totalIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  const categoryMap = new Map<string, { type: 'income' | 'expense'; total: number; count: number }>();
  for (const row of rows) {
    const key = `${row.category}::${row.type}`;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.total += row.amount;
      existing.count += 1;
    } else {
      categoryMap.set(key, { type: row.type, total: row.amount, count: 1 });
    }
  }

  const byCategory = Array.from(categoryMap.entries()).map(([key, val]) => ({
    category: key.split('::')[0] as TransactionCategory,
    type: val.type,
    total: val.total,
    count: val.count,
  }));

  return {
    month: m,
    year: y,
    totalIncome,
    totalExpense,
    margin: totalIncome - totalExpense,
    byCategory,
    recentTransactions: rows.slice(0, 10),
  };
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd apps/jarvis && npx vitest run tests/lib/finance.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/jarvis/src/lib/finance.ts apps/jarvis/tests/lib/finance.test.ts
git commit -m "feat(finance): add recordTransaction and queryFinances with tests"
```

---

### Task 4: Upgrade command-handler to Claude Tool Use

**Files:**
- Modify: `apps/jarvis/src/lib/command-handler.ts`
- Modify: `apps/jarvis/tests/lib/command-handler.test.ts`

- [ ] **Step 1: Write the failing tests first**

Replace the content of `apps/jarvis/tests/lib/command-handler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([]),
  readClients: vi.fn().mockResolvedValue([]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/finance', () => ({
  recordTransaction: vi.fn(),
  queryFinances: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

import Anthropic from '@anthropic-ai/sdk';
import { recordTransaction, queryFinances } from '@/lib/finance';
import { handleCommand } from '@/lib/command-handler';
import type { DbTransaction, FinancialSummary } from '@/types/jarvis';

const mockTransaction: DbTransaction = {
  id: 'txn-1',
  type: 'income',
  amount: 1500,
  description: 'Proyecto web NovaMed',
  category: 'cliente',
  client_id: null,
  date: '2026-05-01',
  created_at: '2026-05-01T10:00:00Z',
};

const mockSummary: FinancialSummary = {
  month: 5,
  year: 2026,
  totalIncome: 3000,
  totalExpense: 800,
  margin: 2200,
  byCategory: [],
  recentTransactions: [],
};

describe('handleCommand — plain response', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { response } when Claude sends a plain text message', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hola, soy Jarvis.' }],
    });
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { create: mockCreate } } as never)
    );

    const result = await handleCommand('Hola Jarvis');
    expect(result.response).toBe('Hola, soy Jarvis.');
    expect(result.action).toBeUndefined();
  });
});

describe('handleCommand — record_transaction tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a transaction when Claude calls record_transaction', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'record_transaction',
            input: { type: 'income', amount: 1500, description: 'Proyecto web', category: 'cliente' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Transacción registrada: ingreso de 1.500€.' }],
      });

    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { create: mockCreate } } as never)
    );
    vi.mocked(recordTransaction).mockResolvedValue(mockTransaction);

    const result = await handleCommand('Hemos cobrado 1500 euros del proyecto NovaMed');
    expect(result.response).toBe('Transacción registrada: ingreso de 1.500€.');
    expect(result.action?.type).toBe('transaction_recorded');
    expect((result.action as { type: string; transaction: DbTransaction }).transaction).toEqual(mockTransaction);
    expect(recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', amount: 1500 })
    );
  });
});

describe('handleCommand — query_finances tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a financial summary when Claude calls query_finances', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool-2',
            name: 'query_finances',
            input: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'En mayo tienes 3.000€ de ingresos y 800€ de gastos.' }],
      });

    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { create: mockCreate } } as never)
    );
    vi.mocked(queryFinances).mockResolvedValue(mockSummary);

    const result = await handleCommand('¿Cómo vamos de finanzas este mes?');
    expect(result.response).toContain('3.000€');
    expect(result.action?.type).toBe('financial_summary');
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
cd apps/jarvis && npx vitest run tests/lib/command-handler.test.ts
```

Expected: FAIL — type errors because `handleCommand` currently returns `{ response: string }` without `action`.

- [ ] **Step 3: Replace command-handler.ts**

Replace the entire `apps/jarvis/src/lib/command-handler.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readTasks, readClients, readPendingCheckpoints } from '@/lib/supabase';
import { recordTransaction, queryFinances } from '@/lib/finance';
import type {
  CommandResult,
  RecordTransactionInput,
  TransactionCategory,
} from '@/types/jarvis';

const SYSTEM_PROMPT = `Eres Jarvis, el asistente ejecutivo de voz de HAT3X.
HAT3X es una consultoría de IA española que construye agentes, chatbots y webs.
Responde siempre en español, de forma concisa (máximo 2 frases).
Cuando el usuario mencione cobros, pagos, ingresos o gastos, usa la herramienta record_transaction.
Cuando pida resúmenes financieros, informes o preguntas sobre dinero, usa query_finances.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'record_transaction',
    description:
      'Registra un ingreso o gasto en la base de datos de HAT3X. Llámala cuando el usuario mencione cobros, pagos, facturas, gastos o ingresos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['income', 'expense'],
          description: 'income para ingresos, expense para gastos',
        },
        amount: { type: 'number', description: 'Cantidad en euros (número positivo)' },
        description: { type: 'string', description: 'Descripción breve de la transacción' },
        category: {
          type: 'string',
          enum: ['cliente', 'otro', 'herramientas_saas', 'personal', 'marketing', 'infraestructura'],
          description: 'Categoría de la transacción',
        },
        client_id: {
          type: 'string',
          description: 'ID del cliente en Supabase si aplica (opcional)',
        },
        date: {
          type: 'string',
          description: 'Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)',
        },
      },
      required: ['type', 'amount', 'description', 'category'],
    },
  },
  {
    name: 'query_finances',
    description:
      'Consulta el resumen financiero del mes actual o de un mes concreto. Llámala cuando el usuario pregunte por ingresos, gastos, margen o resúmenes económicos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        month: { type: 'number', description: 'Mes (1-12, opcional, por defecto el actual)' },
        year: { type: 'number', description: 'Año (opcional, por defecto el actual)' },
      },
      required: [],
    },
  },
];

export async function handleCommand(text: string): Promise<CommandResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  const [tasks, clients, checkpoints] = await Promise.all([
    readTasks(),
    readClients(),
    readPendingCheckpoints(),
  ]);

  const context = `
Tareas activas: ${JSON.stringify(tasks.slice(0, 5))}
Clientes: ${JSON.stringify(clients.slice(0, 5))}
Checkpoints pendientes: ${JSON.stringify(checkpoints.slice(0, 3))}
  `.trim();

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${context}\n\nUsuario: ${text}` },
  ];

  let finalResponse = '';
  let action: CommandResult['action'];

  const firstResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  });

  if (firstResponse.stop_reason === 'tool_use') {
    const toolBlock = firstResponse.content.find((b) => b.type === 'tool_use') as
      | Anthropic.ToolUseBlock
      | undefined;

    if (toolBlock) {
      let toolResult: string;

      if (toolBlock.name === 'record_transaction') {
        const input = toolBlock.input as RecordTransactionInput & { category: TransactionCategory };
        const transaction = await recordTransaction(input);
        action = { type: 'transaction_recorded', transaction };
        toolResult = JSON.stringify(transaction);
      } else if (toolBlock.name === 'query_finances') {
        const input = toolBlock.input as { month?: number; year?: number };
        const summary = await queryFinances(input.month, input.year);
        action = { type: 'financial_summary', summary };
        toolResult = JSON.stringify(summary);
      } else {
        toolResult = '{}';
      }

      messages.push({ role: 'assistant', content: firstResponse.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolResult }],
      });

      const secondResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      const textBlock = secondResponse.content.find((b) => b.type === 'text') as
        | Anthropic.TextBlock
        | undefined;
      finalResponse = textBlock?.text ?? 'Acción completada.';
    }
  } else {
    const textBlock = firstResponse.content.find((b) => b.type === 'text') as
      | Anthropic.TextBlock
      | undefined;
    finalResponse = textBlock?.text ?? 'Sin respuesta.';
  }

  return { response: finalResponse, action };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/jarvis && npx vitest run tests/lib/command-handler.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/jarvis && npx vitest run
```

Expected: all tests PASS (minimum 15 total).

- [ ] **Step 6: Commit**

```bash
git add apps/jarvis/src/lib/command-handler.ts apps/jarvis/tests/lib/command-handler.test.ts
git commit -m "feat(command): upgrade to Claude tool use for financial intents"
```

---

### Task 5: FinanceBadge component

**Files:**
- Create: `apps/jarvis/src/components/finance-badge.tsx`

- [ ] **Step 1: Glob to confirm no existing file**

```bash
ls apps/jarvis/src/components/
```

Expected: no `finance-badge.tsx` present.

- [ ] **Step 2: Write the component**

Create `apps/jarvis/src/components/finance-badge.tsx`:

```tsx
'use client';
import type { CommandAction, FinancialSummary } from '@/types/jarvis';

interface Props {
  action: CommandAction;
}

const CATEGORY_LABELS: Record<string, string> = {
  cliente: 'Cliente',
  otro: 'Otro',
  herramientas_saas: 'SaaS',
  personal: 'Personal',
  marketing: 'Marketing',
  infraestructura: 'Infraestructura',
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function TransactionBadge({
  transaction,
}: {
  transaction: { type: string; amount: number; description: string; category: string };
}) {
  const isIncome = transaction.type === 'income';
  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-surface px-4 py-3 text-sm w-full max-w-xs">
      <div className="flex items-center justify-between mb-1">
        <span className={`font-semibold text-base ${isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
          {isIncome ? '+' : '-'}{fmt(transaction.amount)}
        </span>
        <span className="text-jarvis-muted text-xs uppercase tracking-wide">
          {CATEGORY_LABELS[transaction.category] ?? transaction.category}
        </span>
      </div>
      <p className="text-jarvis-text truncate">{transaction.description}</p>
      <p className="text-jarvis-muted text-xs mt-0.5">{isIncome ? 'Ingreso' : 'Gasto'} registrado</p>
    </div>
  );
}

function SummaryBadge({ summary }: { summary: FinancialSummary }) {
  const monthName = new Date(summary.year, summary.month - 1).toLocaleString('es-ES', {
    month: 'long',
  });
  const isPositive = summary.margin >= 0;
  return (
    <div className="rounded-lg border border-jarvis-border bg-jarvis-surface px-4 py-3 text-sm w-full max-w-xs space-y-2">
      <p className="text-jarvis-muted text-xs uppercase tracking-wide font-mono">
        Resumen {monthName} {summary.year}
      </p>
      <div className="flex justify-between">
        <span className="text-jarvis-muted">Ingresos</span>
        <span className="text-emerald-400 font-semibold">{fmt(summary.totalIncome)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-jarvis-muted">Gastos</span>
        <span className="text-red-400 font-semibold">{fmt(summary.totalExpense)}</span>
      </div>
      <div className="flex justify-between border-t border-jarvis-border pt-2">
        <span className="text-jarvis-text font-semibold">Margen</span>
        <span className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmt(summary.margin)}
        </span>
      </div>
    </div>
  );
}

export function FinanceBadge({ action }: Props) {
  if (action.type === 'transaction_recorded') {
    return <TransactionBadge transaction={action.transaction} />;
  }
  if (action.type === 'financial_summary') {
    return <SummaryBadge summary={action.summary} />;
  }
  return null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/jarvis && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/jarvis/src/components/finance-badge.tsx
git commit -m "feat(ui): add FinanceBadge component for financial confirmations"
```

---

### Task 6: Wire FinanceBadge into page.tsx

**Files:**
- Modify: `apps/jarvis/src/app/page.tsx`
- Modify: `apps/jarvis/src/app/api/command/route.ts`

- [ ] **Step 1: Read current page.tsx**

Read `apps/jarvis/src/app/page.tsx` to confirm current import list and state shape before editing.

- [ ] **Step 2: Update page.tsx**

Replace the entire file:

```tsx
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
```

- [ ] **Step 3: Update the command API route to forward action**

Read `apps/jarvis/src/app/api/command/route.ts`, then replace its content:

```typescript
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

- [ ] **Step 4: Full TypeScript check**

```bash
cd apps/jarvis && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/jarvis && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Start dev server and verify**

```bash
cd apps/jarvis && npm run dev
```

Open http://localhost:3001 in the browser.

Manual verification checklist:
- [ ] Page loads without errors
- [ ] Say "Jarvis, hemos cobrado 500 euros de un nuevo cliente" → FinanceBadge appears showing income confirmation
- [ ] Say "¿Cómo vamos de finanzas este mes?" → SummaryBadge appears with income/expense/margin
- [ ] Say "¿Qué tareas tienes pendientes?" → plain text response, no badge appears

- [ ] **Step 7: Final commit**

```bash
git add apps/jarvis/src/app/page.tsx apps/jarvis/src/app/api/command/route.ts
git commit -m "feat(jarvis): wire FinanceBadge into page, forward CommandResult from API"
```

---

## Post-Implementation Checklist

- [ ] Supabase migration `003_transactions.sql` applied in production
- [ ] `.env.local` has all required keys (`OPENAI_API_KEY`, `ELEVENLABS_*`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] All tests pass: `cd apps/jarvis && npx vitest run`
- [ ] Build succeeds: `cd apps/jarvis && npm run build`
- [ ] Voice command "hemos cobrado X euros" records transaction and shows badge
- [ ] Voice command "resumen financiero" returns summary badge
- [ ] Merge `feat/jarvis-pwa` into `main`
