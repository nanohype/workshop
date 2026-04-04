import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows, runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-error';
import { parseBody, parseUuid, updateWorkflowSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'workflow ID');
    if (!check.success) return check.response;

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)));

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json(workflow);
  } catch (error) {
    return handleApiError(error, 'GET /api/workflows/:id');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'workflow ID');
    if (!check.success) return check.response;

    const body = await request.json();

    const parsed = parseBody(updateWorkflowSchema, body);
    if (!parsed.success) return parsed.response;
    const { name, description, graphData, variables } = parsed.data;

    // Only update fields that are provided
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (graphData !== undefined) updateData.graphData = graphData;
    if (variables !== undefined) updateData.variables = variables;

    const [updated] = await db
      .update(workflows)
      .set(updateData)
      .where(and(eq(workflows.id, id), eq(workflows.userId, userId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'PUT /api/workflows/:id');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'workflow ID');
    if (!check.success) return check.response;

    // Cascade: delete associated runs first (atomic)
    await db.transaction(async (tx) => {
      await tx.delete(runs).where(and(eq(runs.workflowId, id), eq(runs.userId, userId)));
      await tx.delete(workflows).where(and(eq(workflows.id, id), eq(workflows.userId, userId)));
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/workflows/:id');
  }
}
