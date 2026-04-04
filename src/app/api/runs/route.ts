import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-error';
import { parseQuery, listRunsQuerySchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();

    const rl = rateLimit(`list-runs:${userId}`, 60);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const parsed = parseQuery(listRunsQuerySchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { workflowId, status, limit, offset } = parsed.data;

    const conditions = [eq(runs.userId, userId)];
    if (workflowId) {
      conditions.push(eq(runs.workflowId, workflowId));
    }
    if (status) {
      conditions.push(eq(runs.status, status));
    }

    const allRuns = await db
      .select({
        id: runs.id,
        workflowId: runs.workflowId,
        status: runs.status,
        tokenUsage: runs.tokenUsage,
        startedAt: runs.startedAt,
        completedAt: runs.completedAt,
      })
      .from(runs)
      .where(and(...conditions))
      .orderBy(desc(runs.startedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(allRuns);
  } catch (error) {
    return handleApiError(error, 'GET /api/runs');
  }
}
