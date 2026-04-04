import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { fetchComposite } from '@/lib/nanohype/catalog';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const userId = await getAuthUserId();
    const rl = rateLimit(`nanohype-composite:${userId}`, 30);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { name } = await params;
    const manifest = await fetchComposite(name);
    return NextResponse.json(manifest);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch composite' }, { status: 500 });
  }
}
