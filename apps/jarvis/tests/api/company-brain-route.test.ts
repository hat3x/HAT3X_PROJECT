import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/company-brain', () => ({
  readCompanyBrainContext: vi.fn(),
  recordRecurringExpense: vi.fn(),
  recordProjectRevenue: vi.fn(),
  recordProjectCost: vi.fn(),
  addCompanyMemory: vi.fn(),
}));

import {
  addCompanyMemory,
  readCompanyBrainContext,
  recordProjectCost,
  recordProjectRevenue,
  recordRecurringExpense,
} from '@/lib/company-brain';
import { GET, POST } from '@/app/api/company-brain/route';

function request(body: unknown) {
  return new Request('http://localhost/api/company-brain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('/api/company-brain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the current company brain context', async () => {
    vi.mocked(readCompanyBrainContext).mockResolvedValue({
      monthlyRecurringExpenses: 120,
      projectRevenueOpen: 2500,
      projectCostsOpen: 300,
      recurringExpenses: [{ name: 'OpenAI', amount: 120, category: 'herramientas_saas', billing_cycle: 'monthly' }],
      projectRevenue: [{ project_id: 'proj-1', client_id: null, amount: 2500, status: 'paid', concept: 'Web' }],
      projectCosts: [{ project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' }],
      memoryNotes: [{ title: 'Regla comercial', content: 'Priorizar mensualidades.', importance: 5 }],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.context.monthlyRecurringExpenses).toBe(120);
    expect(body.context.memoryNotes[0].title).toBe('Regla comercial');
  });

  it('records a recurring expense through the write endpoint', async () => {
    vi.mocked(recordRecurringExpense).mockResolvedValue({
      table: 'hat3x_recurring_expenses',
      id: 'exp-1',
      summary: 'OpenAI: 120 EUR',
    });

    const response = await POST(request({
      type: 'recurring_expense',
      payload: { name: 'OpenAI', amount: 120, category: 'herramientas_saas' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.table).toBe('hat3x_recurring_expenses');
    expect(recordRecurringExpense).toHaveBeenCalledWith({
      name: 'OpenAI',
      amount: 120,
      category: 'herramientas_saas',
    });
  });

  it('routes revenue, cost, and memory writes to the correct brain functions', async () => {
    vi.mocked(recordProjectRevenue).mockResolvedValue({ table: 'hat3x_project_revenue', id: 'rev-1', summary: 'proj-1: +2500 EUR' });
    vi.mocked(recordProjectCost).mockResolvedValue({ table: 'hat3x_project_costs', id: 'cost-1', summary: 'proj-1: -300 EUR' });
    vi.mocked(addCompanyMemory).mockResolvedValue({ table: 'hat3x_company_memory', id: 'mem-1', summary: 'Regla comercial' });

    await POST(request({ type: 'project_revenue', payload: { project_id: 'proj-1', amount: 2500, concept: 'Web' } }));
    await POST(request({ type: 'project_cost', payload: { project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' } }));
    await POST(request({ type: 'memory_note', payload: { title: 'Regla comercial', content: 'No vender sin mantenimiento.' } }));

    expect(recordProjectRevenue).toHaveBeenCalledWith({ project_id: 'proj-1', amount: 2500, concept: 'Web' });
    expect(recordProjectCost).toHaveBeenCalledWith({ project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' });
    expect(addCompanyMemory).toHaveBeenCalledWith({ title: 'Regla comercial', content: 'No vender sin mantenimiento.' });
  });

  it('rejects unknown write types', async () => {
    const response = await POST(request({ type: 'unknown', payload: {} }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Unsupported brain write type');
  });
});
