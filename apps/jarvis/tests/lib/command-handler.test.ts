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
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

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
