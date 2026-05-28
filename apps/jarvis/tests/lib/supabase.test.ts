import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('supabase read bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('readTasks returns array when Supabase returns data', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'HAT3X-001', client_id: 'biodental', order_raw: 'Web corporativa', status: 'running', created_at: '2026-05-28T10:00:00Z' },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }),
      }),
    } as any);

    const { readTasks } = await import('@/lib/supabase');
    const result = await readTasks();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('HAT3X-001');
  });

  it('readTasks returns empty array on Supabase error', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'connection error' } }) }),
      }),
    } as any);

    const { readTasks } = await import('@/lib/supabase');
    const result = await readTasks();
    expect(result).toEqual([]);
  });

  it('readClients returns array of clients', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'biodental', name: 'BioDental', sector: 'salud', notes: 'Cliente activo', previous_projects: [] },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }),
      }),
    } as any);

    const { readClients } = await import('@/lib/supabase');
    const result = await readClients();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('BioDental');
  });

  it('readPendingCheckpoints returns only pending items', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const mockData = [
      { id: 'cp-1', task_id: 'HAT3X-001', reason: 'Revisar diseño', status: 'pending', triggered_at: '2026-05-28T09:00:00Z' },
    ];
    vi.mocked(createClient).mockReturnValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: mockData, error: null }) }) }),
      }),
    } as any);

    const { readPendingCheckpoints } = await import('@/lib/supabase');
    const result = await readPendingCheckpoints();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
  });
});
