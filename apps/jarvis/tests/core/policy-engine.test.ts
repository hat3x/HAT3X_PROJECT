import { describe, expect, it } from 'vitest';
import {
  classifyToolRisk,
  evaluateToolPolicy,
  isCriticalTool,
  isHighRiskTool,
  isLowRiskTool,
  isMediumRiskTool,
} from '@/core/policy-engine';

describe('Aiden policy engine', () => {
  it('classifies allowed low risk tools for automatic execution', () => {
    expect(classifyToolRisk('supabase_query')).toBe('low');
    expect(classifyToolRisk('query_finances')).toBe('low');
    expect(classifyToolRisk('find_clients')).toBe('low');
    expect(isLowRiskTool('get_task_status')).toBe(true);
  });

  it('classifies medium tools as validation-required', () => {
    expect(classifyToolRisk('create_client')).toBe('medium');
    expect(classifyToolRisk('record_transaction')).toBe('medium');
    expect(isMediumRiskTool('write_file', { path: 'clients/reports/nota.md' })).toBe(true);
  });

  it('classifies high tools as approval-required', () => {
    expect(classifyToolRisk('send_outreach_email')).toBe('high');
    expect(classifyToolRisk('http_request', { method: 'POST' })).toBe('high');
    expect(isHighRiskTool('run_command', { command: 'npm test' })).toBe(true);
  });

  it('classifies critical tools as never executed directly by Aiden', () => {
    expect(classifyToolRisk('supabase_delete')).toBe('critical');
    expect(classifyToolRisk('send_bulk_outreach')).toBe('critical');
    expect(classifyToolRisk('http_request', { method: 'DELETE' })).toBe('critical');
    expect(classifyToolRisk('run_command', { command: 'git push origin main' })).toBe('critical');
    expect(isCriticalTool('write_file', { path: '.env.local' })).toBe(true);
  });

  it('evaluates execution decisions from risk', () => {
    expect(evaluateToolPolicy('find_clients')).toMatchObject({ risk: 'low', decision: 'execute' });
    expect(evaluateToolPolicy('create_client')).toMatchObject({ risk: 'medium', decision: 'prepare' });
    expect(evaluateToolPolicy('http_request', { method: 'PATCH' })).toMatchObject({ risk: 'high', decision: 'require_approval' });
    expect(evaluateToolPolicy('supabase_delete')).toMatchObject({ risk: 'critical', decision: 'delegate_to_command' });
  });
});
