import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-error';
import { parseUuid } from '@/lib/validation';
import { startWorkflowRun } from '@/lib/engine/run-simple';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthUserId();

    const rl = rateLimit(`run:${userId}`, 10);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
    }

    const check = parseUuid(id, 'workflow ID');
    if (!check.success) return check.response;

    const { runId, status } = await startWorkflowRun(id, userId);

    return NextResponse.json({ runId, status }, { status: 202 });
  } catch (error) {
    return handleApiError(error, 'POST /api/workflows/:id/run');
  }
}
