import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([]),
  readClients: vi.fn().mockResolvedValue([]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateClientNotes: vi.fn(),
}));

vi.mock('@/lib/finance', () => ({
  recordTransaction: vi.fn(),
  queryFinances: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

import Anthropic from '@anthropic-ai/sdk';
import { recordTransaction, queryFinances } from '@/lib/finance';
import { createTask, updateClientNotes } from '@/lib/supabase';
import { handleCommand } from '@/lib/command-handler';
import type { DbTransaction, FinancialSummary, DbTask, DbClient } from '@/types/jarvis';

const mockTransaction: DbTransaction = {
  id: 'txn-1', type: 'income', amount: 1500, description: 'Proyecto web NovaMed',
  category: 'cliente', client_id: null, date: '2026-05-01', created_at: '2026-05-01T10:00:00Z',
};

const mockSummary: FinancialSummary = {
  month: 5, year: 2026, totalIncome: 3000, totalExpense: 800, margin: 2200,
  byCategory: [], recentTransactions: [],
};

const mockTask: DbTask = {
  id: 'task-1', client_id: 'client-abc', order_raw: 'Diseñar nueva landing para Biodental',
  status: 'pending', created_at: '2026-05-29T10:00:00Z',
};

const mockClient: DbClient = {
  id: 'client-abc', name: 'Biodental', sector: 'salud', notes: '2026-05-29: Quiere chat en la web',
  previous_projects: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('handleCommand — plain response', () => {
  it('returns { response } when Claude sends a plain text message', async () => {
    vi.mocked(Anthropic).mockImplementation(
      () => ({ messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola, soy Jarvis.' }] }) } } as never)
    );
    const result = await handleCommand('Hola Jarvis');
    expect(result.response).toBe('Hola, soy Jarvis.');
    expect(result.action).toBeUndefined();
  });
});

describe('handleCommand — create_task tool', () => {
  it('creates a task when Claude calls create_task', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'create_task', input: { description: 'Diseñar nueva landing para Biodental', client_id: 'client-abc' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tarea creada para Biodental.' }] });
    vi.mocked(Anthropic).mockImplementation(() => ({ messages: { create: mockCreate } } as never));
    vi.mocked(createTask).mockResolvedValue(mockTask);

    const result = await handleCommand('Biodental nos ha pedido una nueva landing');
    expect(result.action?.type).toBe('task_created');
    expect(createTask).toHaveBeenCalledWith('client-abc', 'Diseñar nueva landing para Biodental');
  });
});

describe('handleCommand — update_client_notes tool', () => {
  it('updates client notes when Claude calls update_client_notes', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-2', name: 'update_client_notes', input: { client_id: 'client-abc', note: 'Quiere chat en la web' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nota guardada para Biodental.' }] });
    vi.mocked(Anthropic).mockImplementation(() => ({ messages: { create: mockCreate } } as never));
    vi.mocked(updateClientNotes).mockResolvedValue(mockClient);

    const result = await handleCommand('Apunta que Biodental quiere chat en la web');
    expect(result.action?.type).toBe('client_updated');
    expect(updateClientNotes).toHaveBeenCalledWith('client-abc', 'Quiere chat en la web');
  });
});

describe('handleCommand — record_transaction tool', () => {
  it('records a transaction when Claude calls record_transaction', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-3', name: 'record_transaction', input: { type: 'income', amount: 1500, description: 'Proyecto web', category: 'cliente' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ingreso de 1.500€ registrado.' }] });
    vi.mocked(Anthropic).mockImplementation(() => ({ messages: { create: mockCreate } } as never));
    vi.mocked(recordTransaction).mockResolvedValue(mockTransaction);

    const result = await handleCommand('Hemos cobrado 1500 euros del proyecto NovaMed');
    expect(result.action?.type).toBe('transaction_recorded');
    expect(recordTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', amount: 1500 }));
  });
});

describe('handleCommand — query_finances tool', () => {
  it('returns a financial summary when Claude calls query_finances', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tool-4', name: 'query_finances', input: {} }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'En mayo tienes 3.000€ de ingresos y 800€ de gastos.' }] });
    vi.mocked(Anthropic).mockImplementation(() => ({ messages: { create: mockCreate } } as never));
    vi.mocked(queryFinances).mockResolvedValue(mockSummary);

    const result = await handleCommand('¿Cómo vamos de finanzas este mes?');
    expect(result.action?.type).toBe('financial_summary');
    expect(result.response).toContain('3.000€');
  });
});
