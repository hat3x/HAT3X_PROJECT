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
