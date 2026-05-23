import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { isRunActive } from '@/lib/pipeline/lifecycle';

export async function POST() {
  try {
    const active = await isRunActive();
    if (active.active) {
      return NextResponse.json(
        { ok: false, error: 'run_already_active', runId: active.runId },
        { status: 409 },
      );
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker/run.ts', '--manual'], {
      cwd: process.cwd(),
      detached: true,
      stdio: isDev ? ['ignore', 'inherit', 'inherit'] : 'ignore',
      env: process.env,
    });
    child.unref();

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
