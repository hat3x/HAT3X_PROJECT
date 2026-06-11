import { describe, expect, it } from 'vitest';
import { buildAidenSystemPrompt } from '@/core/aiden-system-prompt';

describe('Aiden system prompt', () => {
  it('keeps Aiden as a safe executive layer over Command', () => {
    const prompt = buildAidenSystemPrompt({ mode: 'project_mode', userName: 'Jota' });

    expect(prompt).toContain('Aiden, la interfaz ejecutiva segura');
    expect(prompt).toContain('Command recibe ordenes estructuradas');
    expect(prompt).toContain('Aiden no debe convertirse en otro Command');
    expect(prompt).toContain('critical: delegar a Command');
  });
});
