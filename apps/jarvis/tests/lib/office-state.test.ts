import { describe, it, expect } from 'vitest';
import { reduceOfficeState, type OfficeEvent, type OfficeAgent } from '@/lib/office-state';

function ev(eventType: string, agentId: string | null, detail = 'trabajando'): OfficeEvent {
  return { taskId: 'HAT3X-001', eventType, agentId, payload: { detail }, createdAt: new Date().toISOString() };
}

describe('reduceOfficeState', () => {
  it('task.progress marks agent working with bubble', () => {
    const m = reduceOfficeState(new Map<string, OfficeAgent>(), ev('task.progress', 'architect', 'diseñando schema'));
    const a = m.get('architect')!;
    expect(a.status).toBe('working');
    expect(a.bubble).toBe('diseñando schema');
    expect(a.taskId).toBe('HAT3X-001');
  });

  it('meeting.called moves agent to meeting', () => {
    let m = reduceOfficeState(new Map(), ev('task.progress', 'architect'));
    m = reduceOfficeState(m, ev('meeting.called', 'architect'));
    expect(m.get('architect')!.status).toBe('meeting');
  });

  it('task.blocked marks blocked; task.completed returns to idle', () => {
    let m = reduceOfficeState(new Map(), ev('task.blocked', 'qa-lead'));
    expect(m.get('qa-lead')!.status).toBe('blocked');
    m = reduceOfficeState(m, ev('task.completed', 'qa-lead'));
    expect(m.get('qa-lead')!.status).toBe('idle');
    expect(m.get('qa-lead')!.bubble).toBeNull();
  });

  it('ignores events without agentId', () => {
    const m = reduceOfficeState(new Map(), ev('checkpoint.triggered', null));
    expect(m.size).toBe(0);
  });
});
