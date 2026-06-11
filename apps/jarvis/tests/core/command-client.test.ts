import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandClient, createCommandPayload } from '@/core/command-client';

vi.stubGlobal('fetch', vi.fn());

describe('CommandClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the formal Aiden to Command payload', () => {
    const payload = createCommandPayload({
      intent: 'project_request',
      orderRaw: 'Crear web para Biodental',
      mode: 'project_mode',
      priority: 'high',
      riskLevel: 'medium',
      clientId: 'biodental',
      context: { conversationSummary: 'Jota quiere un plan antes de ejecutar.' },
      expectedDeliverables: ['Plan ejecutivo', 'Roadmap'],
      constraints: ['Mostrar plan antes de ejecutar'],
    });

    expect(payload).toMatchObject({
      source: 'aiden',
      user: 'jota',
      intent: 'project_request',
      orderRaw: 'Crear web para Biodental',
      clientId: 'biodental',
      mode: 'project_mode',
      priority: 'high',
      riskLevel: 'medium',
      approvalPolicy: { requireApprovalFor: ['high', 'critical'] },
    });
  });

  it('calls Command preview endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, subtasks: [], selections: [], executionPlan: { phases: [], checkpoints: [], totalEstimatedHours: 0, riskLevel: 'low' } }),
    } as Response);

    const client = new CommandClient('http://command.local');
    const result = await client.previewPlan(createCommandPayload({
      intent: 'project_request',
      orderRaw: 'Crear web para Biodental',
      mode: 'project_mode',
      priority: 'normal',
      riskLevel: 'low',
    }));

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://command.local/api/preview', expect.objectContaining({
      method: 'POST',
    }));

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      orderRaw: 'Crear web para Biodental',
      source: 'aiden',
    });
  });

  it('exposes process, status, health and checkpoint methods', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, status: 'running' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);

    const client = new CommandClient('http://command.local');

    await client.processTask('HAT3X-001');
    await client.getTaskStatus('HAT3X-001');
    await client.getHealth();
    await client.approveCheckpoint('CHK-001', 'ok');
    await client.rejectCheckpoint('CHK-002', 'no');

    expect(fetch).toHaveBeenNthCalledWith(1, 'http://command.local/api/process', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://command.local/api/tasks/HAT3X-001/status', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, 'http://command.local/health', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(4, 'http://command.local/api/checkpoints/CHK-001/approve', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(5, 'http://command.local/api/checkpoints/CHK-002/reject', expect.any(Object));
  });
});
