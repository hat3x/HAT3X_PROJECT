import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({
  readTasks: vi.fn().mockResolvedValue([]),
  readClients: vi.fn().mockResolvedValue([
    { id: 'client-biodental', name: 'Biodental', sector: 'salud', notes: null, previous_projects: [] },
  ]),
  readPendingCheckpoints: vi.fn().mockResolvedValue([]),
  createTask: vi.fn(),
  updateClientNotes: vi.fn(),
}));

vi.mock('@/lib/finance', () => ({
  recordTransaction: vi.fn(),
  queryFinances: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: { create: vi.fn() },
  })),
}));

import OpenAI from 'openai';
import { createTask } from '@/lib/supabase';
import { POST } from '@/app/api/command/route';

vi.stubGlobal('fetch', vi.fn());

const previewPayload = {
  ok: true,
  subtasks: [
    {
      id: 'sub-1',
      description: 'Definir arquitectura de la web',
      vertical: 'webs-apps',
      skills: ['nextjs-shadcn'],
      estimatedHours: 4,
      dependencies: [],
    },
    {
      id: 'sub-2',
      description: 'Configurar chatbot con base de conocimiento',
      vertical: 'chatbots',
      skills: ['rag-chatbots'],
      estimatedHours: 6,
      dependencies: ['sub-1'],
    },
  ],
  selections: [
    { subtaskId: 'sub-1', agentId: 'frontend-developer', score: 1, rationale: 'web specialist' },
    { subtaskId: 'sub-2', agentId: 'rag-chatbot-specialist', score: 1, rationale: 'chatbot specialist' },
  ],
  executionPlan: {
    phases: [
      { phaseNumber: 1, subtasks: [{ subtaskId: 'sub-1', agentId: 'frontend-developer' }] },
      { phaseNumber: 2, subtasks: [{ subtaskId: 'sub-2', agentId: 'rag-chatbot-specialist' }] },
    ],
    checkpoints: [{ afterPhase: 1, reason: 'Jose review required', requiredApproval: 'jose' }],
    totalEstimatedHours: 10,
    riskLevel: 'medium',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => previewPayload,
  } as Response);
});

describe('POST /api/command - Jarvis project flow', () => {
  it('returns an executive plan proposal and does not create a task before approval', async () => {
    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        output: [{
          type: 'function_call',
          call_id: 'call-project',
          name: 'delegate_to_pm',
          arguments: JSON.stringify({
            pm: 'webs-apps',
            task: 'Crear web con chatbot para Biodental',
            client_id: 'client-biodental',
            brief: 'Clinica dental con captacion de leads',
          }),
        }],
      })
      .mockResolvedValueOnce({
        output_text: 'Jota, te propongo un plan ejecutivo antes de ejecutar agentes.',
        output: [],
      });
    vi.mocked(OpenAI).mockImplementation(() => ({ responses: { create: mockCreate } } as never));

    const request = new Request('http://localhost/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Jarvis, crea una web con chatbot para Biodental' }),
    }) as NextRequest;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.response).toContain('plan ejecutivo');
    expect(body.action.type).toBe('plan_proposed');
    expect(body.action.plan.clientId).toBe('client-biodental');
    expect(body.action.plan.executionPlan.phases).toHaveLength(2);
    expect(body.action.plan.executionPlan.riskLevel).toBe('medium');
    expect(body.action.plan.selections.map((selection: { agentId: string }) => selection.agentId)).toEqual([
      'frontend-developer',
      'rag-chatbot-specialist',
    ]);
    expect(createTask).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orderRaw: '[@WEBS-APPS] Crear web con chatbot para Biodental | BRIEF: Clinica dental con captacion de leads',
          clientId: 'client-biodental',
        }),
      })
    );
  });
});
