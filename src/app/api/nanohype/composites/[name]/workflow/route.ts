import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { fetchComposite } from '@/lib/nanohype/catalog';
import { compositeToWorkflow } from '@/lib/nanohype/composite-to-workflow';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const userId = await getAuthUserId();
    const rl = rateLimit(`nanohype-gen-workflow:${userId}`, 10);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { name } = await params;
    const body = await request.json();
    const variables = body.variables || {};

    const manifest = await fetchComposite(name);
    const workflow = compositeToWorkflow(manifest, variables);

    return NextResponse.json(workflow);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to generate workflow' }, { status: 500 });
  }
}
