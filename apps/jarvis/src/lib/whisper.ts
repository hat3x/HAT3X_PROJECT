export async function transcribeAudio(audio: Blob, filename = 'recording.webm'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  // OpenAI rejects 'audio/webm;codecs=opus' — normalize to plain 'audio/webm'
  const baseType = audio.type.split(';')[0] ?? 'audio/webm';
  const cleanAudio = audio.type === baseType ? audio : new Blob([await audio.arrayBuffer()], { type: baseType });

  const form = new FormData();
  form.append('file', cleanAudio, filename);
  form.append('model', 'whisper-1');
  form.append('language', 'es');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText);
  }

  const data = await res.json() as { text: string };
  return data.text;
}
