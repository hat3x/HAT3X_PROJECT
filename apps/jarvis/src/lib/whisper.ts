import OpenAI from 'openai';

export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const client = new OpenAI({ apiKey });
  const file = new File([audioBuffer], filename, { type: 'audio/webm' });

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',
  });

  return response.text;
}
