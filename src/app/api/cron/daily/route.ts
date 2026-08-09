import { NextResponse, type NextRequest } from 'next/server';

import { logError } from '@/lib/errors';
import { runDailyTasks } from '@/lib/services/cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Tarea programada diaria.
 *
 * Protegida con `CRON_SECRET`: Vercel Cron envía el header
 * `Authorization: Bearer $CRON_SECRET`. Sin ese secreto el endpoint responde
 * 401, de modo que nadie puede dispararlo desde fuera.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no está configurado en el entorno.' },
      { status: 500 },
    );
  }

  const header = request.headers.get('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : request.nextUrl.searchParams.get('secret');

  if (provided !== secret) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const result = await runDailyTasks();
    return NextResponse.json({ ok: true, executedAt: new Date().toISOString(), ...result });
  } catch (error) {
    const app = logError('cron.daily', error);
    return NextResponse.json({ ok: false, error: app.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
