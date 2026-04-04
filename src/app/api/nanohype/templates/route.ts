import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { listTemplates } from '@/lib/nanohype/catalog';

export async function GET() {
  try {
    const userId = await getAuthUserId();
    const rl = rateLimit(`nanohype-templates:${userId}`, 30);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const templates = await listTemplates();
    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}
