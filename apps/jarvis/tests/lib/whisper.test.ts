import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('whisper transcription', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns transcribed text from audio blob', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hola jarvis qué proyectos tenemos activos' }),
    }));
    const { transcribeAudio } = await import('@/lib/whisper');
    const audio = new Blob(['fake-audio-data'], { type: 'audio/webm' });
    const result = await transcribeAudio(audio, 'recording.webm');
    expect(result).toBe('hola jarvis qué proyectos tenemos activos');
  });

  it('throws if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { transcribeAudio } = await import('@/lib/whisper');
    const audio = new Blob(['data'], { type: 'audio/webm' });
    await expect(transcribeAudio(audio, 'recording.webm')).rejects.toThrow('Missing OPENAI_API_KEY');
  });

  it('throws on non-ok response from OpenAI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: async () => '{"error":"invalid_api_key"}',
    }));
    const { transcribeAudio } = await import('@/lib/whisper');
    const audio = new Blob(['data'], { type: 'audio/webm' });
    await expect(transcribeAudio(audio, 'recording.webm')).rejects.toThrow('invalid_api_key');
  });
});
