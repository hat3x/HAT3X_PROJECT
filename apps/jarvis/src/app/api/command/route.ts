import { NextRequest, NextResponse } from 'next/server';
import { handleCommand } from '@/lib/command-handler';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string };
    if (!body.text || typeof body.text !== 'string') {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    const result = await handleCommand(body.text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/command]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
