const BASE = 'https://api.elevenlabs.io/v1';

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error('Missing ElevenLabs env vars');

  const response = await fetch(`${BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.2 },
    }),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${msg}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
