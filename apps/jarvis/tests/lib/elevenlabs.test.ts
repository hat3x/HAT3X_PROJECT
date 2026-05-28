import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('fetch', vi.fn());

describe('elevenlabs TTS', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ELEVENLABS_API_KEY = 'test-key';
    process.env.ELEVENLABS_VOICE_ID = 'test-voice-id';
  });

  it('returns Buffer from successful response', async () => {
    const mockBuffer = Buffer.from('mock-audio-bytes');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockBuffer.buffer,
    } as any);

    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    const result = await synthesizeSpeech('Hola, soy Jarvis.');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('throws when ElevenLabs returns error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as any);

    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    await expect(synthesizeSpeech('test')).rejects.toThrow('ElevenLabs error 401');
  });

  it('throws if env vars are missing', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { synthesizeSpeech } = await import('@/lib/elevenlabs');
    await expect(synthesizeSpeech('test')).rejects.toThrow('Missing ElevenLabs env vars');
  });
});
