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
