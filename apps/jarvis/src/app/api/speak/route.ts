import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/lib/elevenlabs';

export const maxDuration = 30;

function truncateForTTS(text: string, maxChars = 1800): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('.', maxChars);
  return cut > 100 ? text.slice(0, cut + 1) : text.slice(0, maxChars);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const audioBuffer = await synthesizeSpeech(truncateForTTS(body.text));
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/speak]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
