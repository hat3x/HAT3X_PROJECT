import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '@/lib/supabase';
import {
  addCompanyMemory,
  readCompanyBrainContext,
  recordProjectCost,
  recordProjectRevenue,
  recordRecurringExpense,
} from '@/lib/company-brain';

function chain(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe('readCompanyBrainContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a compact company memory snapshot from Supabase tables', async () => {
    const fakeClient = {
      from: vi.fn((table: string) => {
        if (table === 'hat3x_recurring_expenses') {
          return chain({ data: [{ name: 'OpenAI', amount: 120, category: 'herramientas_saas', billing_cycle: 'monthly' }], error: null });
        }
        if (table === 'hat3x_project_revenue') {
          return chain({ data: [{ project_id: 'proj-1', client_id: 'client-1', amount: 2500, status: 'paid', concept: 'Web' }], error: null });
        }
        if (table === 'hat3x_project_costs') {
          return chain({ data: [{ project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' }], error: null });
        }
        if (table === 'hat3x_company_memory') {
          return chain({ data: [{ title: 'Preferencia comercial', content: 'Priorizar proyectos con mensualidad.', importance: 5 }], error: null });
        }
        return chain({ data: [], error: null });
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const result = await readCompanyBrainContext();

    expect(result.monthlyRecurringExpenses).toBe(120);
    expect(result.projectRevenueOpen).toBe(2500);
    expect(result.projectCostsOpen).toBe(300);
    expect(result.memoryNotes[0]?.title).toBe('Preferencia comercial');
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_recurring_expenses');
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_project_revenue');
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_project_costs');
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_company_memory');
  });

  it('returns safe defaults when one brain table is not available yet', async () => {
    const fakeClient = {
      from: vi.fn((table: string) => {
        if (table === 'hat3x_recurring_expenses') {
          return chain({ data: null, error: { message: 'relation does not exist' } });
        }
        return chain({ data: [], error: null });
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const result = await readCompanyBrainContext();

    expect(result.monthlyRecurringExpenses).toBe(0);
    expect(result.projectRevenueOpen).toBe(0);
    expect(result.memoryNotes).toEqual([]);
  });
});

describe('company brain writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records recurring expenses', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'exp-1', name: 'OpenAI', amount: 120 }, error: null }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const result = await recordRecurringExpense({ name: 'OpenAI', amount: 120, category: 'herramientas_saas' });

    expect(result.table).toBe('hat3x_recurring_expenses');
    expect(fakeClient.from).toHaveBeenCalledWith('hat3x_recurring_expenses');
    expect(fakeClient.insert).toHaveBeenCalledWith(expect.objectContaining({ billing_cycle: 'monthly', active: true }));
  });

  it('records project revenue and costs', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: { id: 'rev-1', project_id: 'proj-1', amount: 2500 }, error: null })
        .mockResolvedValueOnce({ data: { id: 'cost-1', project_id: 'proj-1', amount: 300 }, error: null }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const revenue = await recordProjectRevenue({ project_id: 'proj-1', amount: 2500, concept: 'Web' });
    const cost = await recordProjectCost({ project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' });

    expect(revenue.table).toBe('hat3x_project_revenue');
    expect(cost.table).toBe('hat3x_project_costs');
  });

  it('sets unknown project client ids to null before writing revenue and costs', async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'rev-1', project_id: 'proj-1', amount: 2500 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'cost-1', project_id: 'proj-1', amount: 300 }, error: null });

    const fakeClient = {
      from: vi.fn((table: string) => {
        if (table === 'hat3x_clients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle,
          };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: maybeSingle,
        };
      }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    await recordProjectRevenue({ project_id: 'proj-1', client_id: 'invented-client', amount: 2500, concept: 'Web' });
    await recordProjectCost({ project_id: 'proj-1', client_id: 'invented-client', amount: 300, category: 'infraestructura', description: 'Hosting' });

    const revenueInsert = vi.mocked(fakeClient.from).mock.results[1]?.value.insert;
    const costInsert = vi.mocked(fakeClient.from).mock.results[3]?.value.insert;
    expect(revenueInsert).toHaveBeenCalledWith(expect.objectContaining({ client_id: null }));
    expect(costInsert).toHaveBeenCalledWith(expect.objectContaining({ client_id: null }));
  });

  it('adds company memory notes', async () => {
    const fakeClient = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'mem-1', title: 'Regla comercial' }, error: null }),
    };
    vi.mocked(getSupabaseClient).mockReturnValue(fakeClient as never);

    const result = await addCompanyMemory({ title: 'Regla comercial', content: 'No vender webs sin mantenimiento.', importance: 5 });

    expect(result.table).toBe('hat3x_company_memory');
    expect(fakeClient.insert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'company', source: 'jarvis' }));
  });
});
