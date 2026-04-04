import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { getAuthUserId } from '@/lib/api-auth';
import { eq, desc } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-error';
import { parseQuery, parseBody, paginationSchema, createWorkflowSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();

    const rl = rateLimit(`list-workflows:${userId}`, 60);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const parsed = parseQuery(paginationSchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { limit, offset } = parsed.data;

    const allWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.userId, userId))
      .orderBy(desc(workflows.updatedAt))
      .limit(limit)
      .offset(offset);
    return NextResponse.json(allWorkflows);
  } catch (error) {
    return handleApiError(error, 'GET /api/workflows');
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    const body = await request.json();

    const parsed = parseBody(createWorkflowSchema, body);
    if (!parsed.success) return parsed.response;
    const { name, description, graphData, variables } = parsed.data;

    const [workflow] = await db
      .insert(workflows)
      .values({
        userId,
        name,
        description,
        graphData: graphData || { nodes: [], edges: [] },
        variables,
      })
      .returning();

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/workflows');
  }
}
