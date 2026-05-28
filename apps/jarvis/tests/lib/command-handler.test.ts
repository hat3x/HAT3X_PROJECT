import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tienes 2 proyectos activos: BioDental y ObraTech.' }],
      }),
    },
  })),
}));

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([
    { id: 'HAT3X-001', client_id: 'biodental', order_raw: 'Web corporativa', status: 'running', created_at: '2026-05-28T10:00:00Z' },
    { id: 'HAT3X-002', client_id: 'obratech', order_raw: 'Agente de voz', status: 'pending', created_at: '2026-05-27T10:00:00Z' },
  ]),
  readClients: vi.fn().mockResolvedValue([
    { id: 'biodental', name: 'BioDental', sector: 'salud', notes: 'Pide actualizar precios', previous_projects: [] },
  ]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
}));

describe('command handler', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('returns a string response', async () => {
    const { handleCommand } = await import('@/lib/command-handler');
    const result = await handleCommand('¿qué proyectos tenemos activos?');
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('throws if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { handleCommand } = await import('@/lib/command-handler');
    await expect(handleCommand('test')).rejects.toThrow('Missing ANTHROPIC_API_KEY');
  });
});
