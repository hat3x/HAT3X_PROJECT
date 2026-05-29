import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/whisper';

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const audio = formData.get('audio');
    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }
    console.log('[/api/transcribe] audio size:', audio.size, 'bytes, type:', audio.type);
    const text = await transcribeAudio(audio, 'recording.webm');
    console.log('[/api/transcribe] transcribed:', JSON.stringify(text));
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/transcribe]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
