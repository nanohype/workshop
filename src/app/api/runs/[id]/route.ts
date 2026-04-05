import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-error';
import { parseBody, parseUuid, cancelRunSchema } from '@/lib/validation';
import { pauseRun, resumeWorkflowRun } from '@/lib/engine/run-simple';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'run ID');
    if (!check.success) return check.response;

    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, userId)));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    return handleApiError(error, 'GET /api/runs/:id');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'run ID');
    if (!check.success) return check.response;

    const body = await request.json();

    const parsed = parseBody(cancelRunSchema, body);
    if (!parsed.success) return parsed.response;

    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, userId)));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const { action } = parsed.data;

    if (action === 'cancel') {
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        return NextResponse.json({ error: 'Run is already finished' }, { status: 400 });
      }
      const [updated] = await db
        .update(runs)
        .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(runs.id, id), eq(runs.userId, userId)))
        .returning();
      return NextResponse.json(updated);
    }

    if (action === 'pause') {
      if (run.status !== 'running') {
        return NextResponse.json({ error: 'Only running runs can be paused' }, { status: 400 });
      }
      await pauseRun(id);
      const [updated] = await db
        .select()
        .from(runs)
        .where(eq(runs.id, id));
      return NextResponse.json(updated);
    }

    if (action === 'resume') {
      if (run.status !== 'paused') {
        return NextResponse.json({ error: 'Only paused runs can be resumed' }, { status: 400 });
      }
      const result = await resumeWorkflowRun(id, userId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, 'PATCH /api/runs/:id');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();

    const rl = rateLimit(`delete-run:${userId}`, 30);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;

    const check = parseUuid(id, 'run ID');
    if (!check.success) return check.response;

    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, userId)));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (run.status === 'running') {
      return NextResponse.json({ error: 'Cannot delete a running run' }, { status: 400 });
    }

    await db.delete(runs).where(and(eq(runs.id, id), eq(runs.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/runs/:id');
  }
}
