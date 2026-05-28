import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: 'hola jarvis qué proyectos tenemos activos' }),
      },
    },
  })),
}));

describe('whisper transcription', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('returns transcribed text from audio buffer', async () => {
    const { transcribeAudio } = await import('@/lib/whisper');
    const result = await transcribeAudio(Buffer.from('fake-audio-data'), 'recording.webm');
    expect(result).toBe('hola jarvis qué proyectos tenemos activos');
  });

  it('throws if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { transcribeAudio } = await import('@/lib/whisper');
    await expect(transcribeAudio(Buffer.from('data'), 'recording.webm')).rejects.toThrow('Missing OPENAI_API_KEY');
  });
});
