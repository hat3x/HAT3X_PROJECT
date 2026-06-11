import { describe, expect, it } from 'vitest';
import { classifyAidenRequest, resolveResponseMode } from '@/core/response-mode';

describe('Aiden response mode', () => {
  it('keeps simple status questions in voice mode', () => {
    const result = classifyAidenRequest('como vamos de finanzas este mes');

    expect(result.intent).toBe('finance_query');
    expect(result.mode).toBe('voice_mode');
    expect(result.shouldDelegateToCommand).toBe(false);
  });

  it('routes software projects to Command in project mode', () => {
    const result = classifyAidenRequest('crea una app completa para gestionar reservas de una clinica');

    expect(result.intent).toBe('project_request');
    expect(result.mode).toBe('project_mode');
    expect(result.shouldDelegateToCommand).toBe(true);
  });

  it('routes audits to audit mode', () => {
    const result = classifyAidenRequest('audita la seguridad del proyecto 100 montaditos');

    expect(result.intent).toBe('audit_request');
    expect(result.mode).toBe('audit_mode');
    expect(result.shouldDelegateToCommand).toBe(true);
  });

  it('allows explicit work mode for structured responses', () => {
    expect(resolveResponseMode({ requestedMode: 'work_mode' })).toBe('work_mode');
  });
});
