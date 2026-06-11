import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([]),
  readClients: vi.fn().mockResolvedValue([]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateClientNotes: vi.fn(),
  findClients: vi.fn(),
  createClientRecord: vi.fn(),
}));

vi.mock('@/lib/finance', () => ({
  recordTransaction: vi.fn(),
  queryFinances: vi.fn(),
}));

vi.mock('@/lib/company-brain', () => ({
  readCompanyBrainContext: vi.fn().mockResolvedValue({
    monthlyRecurringExpenses: 420,
    projectRevenueOpen: 3000,
    projectCostsOpen: 600,
    recurringExpenses: [],
    projectRevenue: [],
    projectCosts: [],
    memoryNotes: [{ title: 'Prioridad', content: 'Priorizar proyectos con mensualidad.', importance: 5 }],
  }),
  recordRecurringExpense: vi.fn(),
  recordProjectRevenue: vi.fn(),
  recordProjectCost: vi.fn(),
  addCompanyMemory: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: vi.fn() },
  })),
}));

import OpenAI from 'openai';
import { recordTransaction, queryFinances } from '@/lib/finance';
import { recordRecurringExpense, recordProjectRevenue, recordProjectCost, addCompanyMemory } from '@/lib/company-brain';
import { createClientRecord, createTask, findClients, updateClientNotes } from '@/lib/supabase';
import { handleCommand } from '@/lib/command-handler';
import type { BrainWriteResult, DbTransaction, FinancialSummary, DbTask, DbClient } from '@/types/jarvis';

vi.stubGlobal('fetch', vi.fn());

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

const mockTask: DbTask = {
  id: 'task-1',
  client_id: 'client-abc',
  order_raw: 'Disenar nueva landing para Biodental',
  status: 'pending',
  created_at: '2026-05-29T10:00:00Z',
};

const mockClient: DbClient = {
  id: 'client-abc',
  name: 'Biodental',
  sector: 'salud',
  notes: '2026-05-29: Quiere chat en la web',
  previous_projects: [],
};

const mockBrainWrite: BrainWriteResult = {
  table: 'hat3x_recurring_expenses',
  id: 'brain-1',
  summary: 'OpenAI: 120 EUR',
};

const mockPreview = {
  ok: true,
  subtasks: [
    { id: 'sub-1', description: 'Disenar nueva landing para Biodental', vertical: 'webs-apps', skills: ['nextjs-shadcn'], estimatedHours: 6, dependencies: [] },
  ],
  selections: [
    { subtaskId: 'sub-1', agentId: 'frontend-developer', score: 1, rationale: 'matches web stack' },
  ],
  executionPlan: {
    phases: [{ phaseNumber: 1, subtasks: [{ subtaskId: 'sub-1', agentId: 'frontend-developer' }] }],
    checkpoints: [],
    totalEstimatedHours: 6,
    riskLevel: 'low',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => mockPreview,
  } as Response);
});

describe('handleCommand - plain response', () => {
  it('returns { response } when OpenAI sends a plain text message with company brain context', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ output_text: 'Hola, soy Jarvis.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));

    const result = await handleCommand('Hola Jarvis');

    expect(result.response).toBe('Hola, soy Jarvis.');
    expect(result.action).toBeUndefined();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      instructions: expect.stringContaining('Cerebro empresa'),
    }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      instructions: expect.stringContaining('monthlyRecurringExpenses'),
    }));
  });
});

describe('handleCommand - create_task tool', () => {
  it('proposes a plan instead of creating a task when OpenAI calls create_task', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-1',
          name: 'create_task',
          arguments: JSON.stringify({ description: 'Disenar nueva landing para Biodental', client_id: 'client-abc' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Te propongo un plan ejecutivo para Biodental.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(createTask).mockResolvedValue(mockTask);

    const result = await handleCommand('Biodental nos ha pedido una nueva landing');
    expect(result.action?.type).toBe('plan_proposed');
    expect(createTask).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ orderRaw: 'Disenar nueva landing para Biodental', clientId: 'client-abc' }),
      })
    );
  });
});

describe('handleCommand - delegate_to_pm tool', () => {
  it('proposes a plan instead of delegating immediately when OpenAI calls delegate_to_pm', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-delegate',
          name: 'delegate_to_pm',
          arguments: JSON.stringify({ pm: 'webs-apps', task: 'Crear web con chatbot para Biodental', client_id: 'client-abc', brief: 'Clinica dental' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Plan listo para revisar.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));

    const result = await handleCommand('Crea una web con chatbot para Biodental');
    expect(result.action?.type).toBe('plan_proposed');
    expect(createTask).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orderRaw: '[@WEBS-APPS] Crear web con chatbot para Biodental | BRIEF: Clinica dental',
          clientId: 'client-abc',
        }),
      })
    );
  });
});

describe('handleCommand - update_client_notes tool', () => {
  it('updates client notes when OpenAI calls update_client_notes', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-2',
          name: 'update_client_notes',
          arguments: JSON.stringify({ client_id: 'client-abc', note: 'Quiere chat en la web' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Nota guardada para Biodental.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(updateClientNotes).mockResolvedValue(mockClient);

    const result = await handleCommand('Apunta que Biodental quiere chat en la web');
    expect(result.action?.type).toBe('client_updated');
    expect(updateClientNotes).toHaveBeenCalledWith('client-abc', 'Quiere chat en la web');
  });
});

describe('handleCommand - record_transaction tool', () => {
  it('records a transaction when OpenAI calls record_transaction', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-3',
          name: 'record_transaction',
          arguments: JSON.stringify({ type: 'income', amount: 1500, description: 'Proyecto web', category: 'cliente' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Ingreso de 1.500 euros registrado.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(recordTransaction).mockResolvedValue(mockTransaction);

    const result = await handleCommand('Hemos cobrado 1500 euros del proyecto NovaMed');
    expect(result.action?.type).toBe('transaction_recorded');
    expect(recordTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', amount: 1500 }));
  });
});

describe('handleCommand - query_finances tool', () => {
  it('returns a financial summary when OpenAI calls query_finances', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-4',
          name: 'query_finances',
          arguments: JSON.stringify({}),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'En mayo tienes 3.000 euros de ingresos y 800 euros de gastos.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(queryFinances).mockResolvedValue(mockSummary);

    const result = await handleCommand('Como vamos de finanzas este mes?');
    expect(result.action?.type).toBe('financial_summary');
    expect(result.response).toContain('3.000');
  });
});

describe('handleCommand - company brain tools', () => {
  it('records recurring expenses when OpenAI calls record_recurring_expense', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-brain-1',
          name: 'record_recurring_expense',
          arguments: JSON.stringify({ name: 'OpenAI', amount: 120, category: 'herramientas_saas' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Gasto recurrente guardado.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(recordRecurringExpense).mockResolvedValue(mockBrainWrite);

    const result = await handleCommand('Guarda OpenAI como gasto fijo de 120 euros al mes');

    expect(result.action?.type).toBe('brain_updated');
    expect(recordRecurringExpense).toHaveBeenCalledWith(expect.objectContaining({ name: 'OpenAI', amount: 120 }));
  });

  it('records project revenue, project cost and company memory', async () => {
    const calls = [
      { name: 'record_project_revenue', args: { project_id: 'proj-1', amount: 2500, concept: 'Web' }, fn: recordProjectRevenue },
      { name: 'record_project_cost', args: { project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' }, fn: recordProjectCost },
      { name: 'add_company_memory', args: { title: 'Regla', content: 'Priorizar mensualidades' }, fn: addCompanyMemory },
    ] as const;

    for (const item of calls) {
      const mockCreate = vi.fn()
        .mockResolvedValueOnce({
          output: [{ type: 'function_call', call_id: `call-${item.name}`, name: item.name, arguments: JSON.stringify(item.args) }],
        })
        .mockResolvedValueOnce({ output_text: 'Memoria actualizada.', output: [] });
      vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
      vi.mocked(item.fn).mockResolvedValue(mockBrainWrite);

      const result = await handleCommand(item.name);

      expect(result.action?.type).toBe('brain_updated');
      expect(item.fn).toHaveBeenCalled();
      vi.clearAllMocks();
      process.env.OPENAI_API_KEY = 'test-key';
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mockPreview } as Response);
    }
  });
});

describe('handleCommand - multiple tool calls', () => {
  it('sends function_call_output for every function call returned by OpenAI', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        id: 'resp-multi',
        output: [
          {
            type: 'function_call',
            call_id: 'call-finance',
            name: 'query_finances',
            arguments: JSON.stringify({}),
          },
          {
            type: 'function_call',
            call_id: 'call-memory',
            name: 'add_company_memory',
            arguments: JSON.stringify({ title: 'Regla', content: 'Priorizar mensualidades' }),
          },
        ],
      })
      .mockResolvedValueOnce({ output_text: 'Finanzas revisadas y memoria guardada.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(queryFinances).mockResolvedValue(mockSummary);
    vi.mocked(addCompanyMemory).mockResolvedValue(mockBrainWrite);

    const result = await handleCommand('Revisa finanzas y recuerda priorizar mensualidades');

    expect(result.response).toBe('Finanzas revisadas y memoria guardada.');
    expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({
      previous_response_id: 'resp-multi',
      input: [
        expect.objectContaining({ type: 'function_call_output', call_id: 'call-finance' }),
        expect.objectContaining({ type: 'function_call_output', call_id: 'call-memory' }),
      ],
    }));
  });
});

describe('handleCommand - operational client reasoning', () => {
  it('can search clients and ask for missing client data before recording revenue', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        id: 'resp-find-client',
        output: [{
          type: 'function_call',
          call_id: 'call-find-client',
          name: 'find_clients',
          arguments: JSON.stringify({ query: 'Biodental' }),
        }],
      })
      .mockResolvedValueOnce({
        output_text: 'Jota, no tengo Biodental dado de alta todavia. Lo creamos? Dame nombre, sector y contacto principal y lo dejo preparado antes de registrar el ingreso.',
        output: [],
      });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(findClients).mockResolvedValue([]);

    const result = await handleCommand('Apunta 1500 euros de ingreso de Biodental');

    expect(result.response).toContain('no tengo Biodental');
    expect(findClients).toHaveBeenCalledWith('Biodental');
    expect(recordProjectRevenue).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({
      previous_response_id: 'resp-find-client',
      input: [expect.objectContaining({ call_id: 'call-find-client', output: '[]' })],
    }));
  });

  it('continues across tool rounds so it can create a client and then record revenue', async () => {
    const newClient = { id: 'biodental', name: 'Biodental', sector: 'salud', notes: 'Contacto: Ana', previous_projects: [] };
    const revenueWrite = { table: 'hat3x_project_revenue', id: 'rev-1', summary: 'biodental-web: +1500 EUR' };
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        id: 'resp-find-client',
        output: [{
          type: 'function_call',
          call_id: 'call-find-client',
          name: 'find_clients',
          arguments: JSON.stringify({ query: 'Biodental' }),
        }],
      })
      .mockResolvedValueOnce({
        id: 'resp-create-client',
        output: [{
          type: 'function_call',
          call_id: 'call-create-client',
          name: 'create_client',
          arguments: JSON.stringify({ name: 'Biodental', sector: 'salud', notes: 'Contacto: Ana' }),
        }],
      })
      .mockResolvedValueOnce({
        id: 'resp-record-revenue',
        output: [{
          type: 'function_call',
          call_id: 'call-record-revenue',
          name: 'record_project_revenue',
          arguments: JSON.stringify({ project_id: 'biodental-web', client_id: 'biodental', amount: 1500, concept: 'Ingreso inicial', status: 'paid' }),
        }],
      })
      .mockResolvedValueOnce({ output_text: 'Listo, Jota. He dado de alta Biodental y he registrado el ingreso.', output: [] });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));
    vi.mocked(findClients).mockResolvedValue([]);
    vi.mocked(createClientRecord).mockResolvedValue(newClient);
    vi.mocked(recordProjectRevenue).mockResolvedValue(revenueWrite);

    const result = await handleCommand('Crea Biodental, sector salud, contacto Ana, y registra 1500 euros cobrados');

    expect(result.response).toContain('Biodental');
    expect(createClientRecord).toHaveBeenCalledWith({ name: 'Biodental', sector: 'salud', notes: 'Contacto: Ana' });
    expect(recordProjectRevenue).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'biodental', amount: 1500 }));
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });
});
