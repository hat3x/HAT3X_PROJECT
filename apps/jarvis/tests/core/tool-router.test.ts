import { describe, expect, it } from 'vitest';
import { routeToolRequest } from '@/core/tool-router';

describe('Aiden tool router', () => {
  it('routes low risk tools to local Aiden execution', () => {
    expect(routeToolRequest('find_clients')).toMatchObject({
      risk: 'low',
      decision: 'execute',
      route: 'aiden',
    });
  });

  it('routes critical tools to Command', () => {
    expect(routeToolRequest('supabase_delete')).toMatchObject({
      risk: 'critical',
      decision: 'delegate_to_command',
      route: 'command',
    });
  });
});
