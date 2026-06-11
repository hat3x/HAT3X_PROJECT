import type { AidenCommandMode } from './response-mode';

export type AidenPriority = 'normal' | 'high' | 'urgent';
export type AidenRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AidenCommandPayload {
  source: 'aiden';
  user: 'jota';
  intent: string;
  orderRaw: string;
  clientId?: string;
  mode: AidenCommandMode;
  priority: AidenPriority;
  riskLevel: AidenRiskLevel;
  approvalPolicy: {
    requireApprovalFor: Array<'high' | 'critical'>;
  };
  context?: {
    conversationSummary?: string;
    crmContext?: object;
    projectContext?: object;
    companyBrain?: object;
  };
  expectedDeliverables?: string[];
  constraints?: string[];
}

export type CreateCommandPayloadInput = Omit<AidenCommandPayload, 'source' | 'user' | 'approvalPolicy'> & {
  approvalPolicy?: AidenCommandPayload['approvalPolicy'];
};

export function createCommandPayload(input: CreateCommandPayloadInput): AidenCommandPayload {
  return {
    ...input,
    source: 'aiden',
    user: 'jota',
    approvalPolicy: input.approvalPolicy ?? { requireApprovalFor: ['high', 'critical'] },
  };
}

export class CommandClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.COMMAND_API_URL || 'http://localhost:8787') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async previewPlan(payload: AidenCommandPayload) {
    return this.request('/api/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async delegateTask(payload: AidenCommandPayload) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async processTask(taskId: string) {
    return this.request('/api/process', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    });
  }

  async getTaskStatus(taskId: string) {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'GET',
    });
  }

  async getHealth() {
    return this.request('/health', { method: 'GET' });
  }

  async approveCheckpoint(id: string, feedback?: string) {
    return this.request(`/api/checkpoints/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

  async rejectCheckpoint(id: string, feedback?: string) {
    return this.request(`/api/checkpoints/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    });
  }

  private async request(path: string, init: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Command request failed with status ${response.status}`);
    }

    return data;
  }
}
