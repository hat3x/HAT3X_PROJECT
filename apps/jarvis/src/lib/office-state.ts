export type AgentStatus = 'working' | 'meeting' | 'blocked' | 'idle';

export interface OfficeAgent {
  agentId: string;
  status: AgentStatus;
  bubble: string | null;
  taskId: string | null;
  lastEventAt: string;
}

export interface OfficeEvent {
  taskId: string;
  eventType: string;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const WORKING = new Set(['task.started', 'task.progress']);
const MEETING = new Set(['meeting.called', 'meeting.statement', 'meeting.vote']);
const BLOCKED = new Set(['task.blocked', 'task.failed']);
const IDLE = new Set(['task.completed', 'meeting.resolved', 'agent.offline']);

export function reduceOfficeState(
  agents: Map<string, OfficeAgent>,
  ev: OfficeEvent
): Map<string, OfficeAgent> {
  if (ev.agentId === null || ev.agentId === '') return agents;

  let status: AgentStatus | null = null;
  if (WORKING.has(ev.eventType)) status = 'working';
  else if (MEETING.has(ev.eventType)) status = 'meeting';
  else if (BLOCKED.has(ev.eventType)) status = 'blocked';
  else if (IDLE.has(ev.eventType)) status = 'idle';
  if (status === null) return agents;

  const detail = typeof ev.payload['detail'] === 'string' ? (ev.payload['detail'] as string) : null;
  const next = new Map(agents);
  next.set(ev.agentId, {
    agentId: ev.agentId,
    status,
    bubble: status === 'idle' ? null : detail,
    taskId: status === 'idle' ? null : ev.taskId,
    lastEventAt: ev.createdAt,
  });
  return next;
}

export function rowToOfficeEvent(row: Record<string, unknown>): OfficeEvent {
  return {
    taskId: row['task_id'] as string,
    eventType: row['event_type'] as string,
    agentId: (row['agent_id'] as string | null) ?? null,
    payload: (row['payload'] as Record<string, unknown>) ?? {},
    createdAt: row['created_at'] as string,
  };
}
