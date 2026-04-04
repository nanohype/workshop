import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-error';
import { parseUuid } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nodeId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id, nodeId } = await params;

    const idCheck = parseUuid(id, 'run ID');
    if (!idCheck.success) return idCheck.response;

    const body = await request.json();
    const action = body.action;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }

    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, userId)));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (run.status !== 'running') {
      return NextResponse.json({ error: 'Run is not active' }, { status: 400 });
    }

    // Check that the node is in waiting state
    const nodeStates = run.nodeStates as Record<string, { status: string }>;
    if (!nodeStates[nodeId] || nodeStates[nodeId].status !== 'waiting') {
      return NextResponse.json({ error: 'Node is not awaiting approval' }, { status: 400 });
    }

    // Store the decision in the run context so the executor can pick it up
    const context = (run.context as Record<string, unknown>) || {};
    context[`gate_${nodeId}_decision`] = action === 'approve' ? 'approved' : 'rejected';

    await db
      .update(runs)
      .set({ context })
      .where(eq(runs.id, id));

    return NextResponse.json({ success: true, action });
  } catch (error) {
    return handleApiError(error, 'PATCH /api/runs/:id/gate/:nodeId');
  }
}
