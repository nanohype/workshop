import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { parseUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();

  const rl = rateLimit(`stream:${userId}`, 20);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { id } = await params;

  const check = parseUuid(id, 'run ID');
  if (!check.success) return check.response;

  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed
        }
      };

      // Send retry directive so EventSource reconnects automatically
      try {
        controller.enqueue(encoder.encode('retry: 2000\n\n'));
      } catch { /* closed */ }

      // Send initial heartbeat
      sendEvent('heartbeat', { time: Date.now() });

      let completed = false;
      let pollCount = 0;
      const maxPolls = 3600; // 1 hour at 1s intervals

      while (!completed && pollCount < maxPolls) {
        // Check if client disconnected
        if (abortSignal.aborted) {
          break;
        }

        try {
          const [run] = await db
            .select()
            .from(runs)
            .where(and(eq(runs.id, id), eq(runs.userId, userId)));

          if (!run) {
            sendEvent('error', { message: 'Run not found' });
            break;
          }

          sendEvent('state', {
            status: run.status,
            nodeStates: run.nodeStates,
            tokenUsage: run.tokenUsage,
          });

          if (['completed', 'failed', 'cancelled'].includes(run.status)) {
            sendEvent('done', { status: run.status });
            completed = true;
          }

          // Wait 1s, but break early if aborted
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1000);
            const onAbort = () => {
              clearTimeout(timer);
              resolve();
            };
            if (abortSignal.aborted) {
              clearTimeout(timer);
              resolve();
            } else {
              abortSignal.addEventListener('abort', onAbort, { once: true });
              // Clean up listener when timer fires normally
              setTimeout(() => abortSignal.removeEventListener('abort', onAbort), 1100);
            }
          });
          pollCount++;
        } catch {
          if (!abortSignal.aborted) {
            sendEvent('error', { message: 'Internal error' });
          }
          break;
        }
      }

      try {
        controller.close();
      } catch {
        // Already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
