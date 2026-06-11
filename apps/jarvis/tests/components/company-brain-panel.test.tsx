import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CompanyBrainPanel } from '@/components/company-brain-panel';

describe('CompanyBrainPanel', () => {
  it('renders the brain summary and quick capture forms', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        context: {
          monthlyRecurringExpenses: 120,
          projectRevenueOpen: 2500,
          projectCostsOpen: 300,
          recurringExpenses: [{ name: 'OpenAI', amount: 120, category: 'herramientas_saas', billing_cycle: 'monthly' }],
          projectRevenue: [{ project_id: 'proj-1', client_id: null, amount: 2500, status: 'paid', concept: 'Web' }],
          projectCosts: [{ project_id: 'proj-1', amount: 300, category: 'infraestructura', description: 'Hosting' }],
          memoryNotes: [{ title: 'Regla comercial', content: 'Priorizar mensualidades.', importance: 5 }],
        },
      }),
    }));

    render(<CompanyBrainPanel />);

    expect(screen.getByText('Cerebro HAT3X')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gastos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ingresos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Costes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Memoria' })).toBeTruthy();
    expect(screen.getByLabelText('Nombre del gasto')).toBeTruthy();
    expect(await screen.findByText(/OpenAI/)).toBeTruthy();
  });
});
