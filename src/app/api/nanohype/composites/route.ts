import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { listComposites } from '@/lib/nanohype/catalog';

export async function GET() {
  try {
    const userId = await getAuthUserId();
    const rl = rateLimit(`nanohype-composites:${userId}`, 30);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const composites = await listComposites();
    return NextResponse.json(composites);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to list composites' }, { status: 500 });
  }
}
