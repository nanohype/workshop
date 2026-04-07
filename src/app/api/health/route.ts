import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'not_configured'> = {};

  // Check database connectivity
  try {
    const { getDb } = await import('@/lib/db');
    getDb();
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Check Claude Code CLI availability
  try {
    const { spawn } = await import('child_process');
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn('claude', ['--version']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
    checks.claude_code = ok ? 'ok' : 'error';
  } catch {
    checks.claude_code = 'error';
  }

  // Best-effort stale run recovery on health check
  if (checks.database === 'ok') {
    import('@/lib/engine/run-simple')
      .then(m => m.recoverStaleRuns())
      .catch(() => {});
  }

  const allOk = checks.database === 'ok';

  const health = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
    checks,
  };

  return NextResponse.json(health, {
    status: allOk ? 200 : 503,
  });
}
