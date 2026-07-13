/**
 * /api/cron/reminders — Vercel Cron Job trigger
 *
 * Vercel llama a esta ruta cada 5 minutos (ver vercel.json).
 * La ruta verifica el secreto y reenvía la petición a la Supabase Edge
 * Function process-reminders, que hace el trabajo real.
 *
 * Variables de entorno necesarias:
 *   CRON_SECRET              — secreto compartido con la Edge Function
 *   NEXT_PUBLIC_SUPABASE_URL — URL base del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — clave de servicio para Authorization
 */

import { NextResponse } from 'next/server';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // Vercel adjunta Authorization: Bearer <CRON_SECRET> en producción
    const authHeader = request.headers.get('authorization');
    const directHeader = request.headers.get('x-cron-secret');
    const authorized =
      authHeader === `Bearer ${cronSecret}` ||
      directHeader === cronSecret;

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  const edgeFnUrl = `${supabaseUrl}/functions/v1/process-reminders`;

  try {
    const response = await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
      body: '{}',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[cron/reminders] edge function error', response.status, data);
      return NextResponse.json({ error: 'Edge Function error', details: data }, { status: 502 });
    }

    console.log('[cron/reminders] ok', JSON.stringify(data));
    return NextResponse.json(data);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/reminders] fetch failed', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
