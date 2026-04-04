import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export function apiError(message: string, status: number, details?: unknown) {
  const requestId = randomUUID().slice(0, 8);
  const body: Record<string, unknown> = {
    error: message,
    status,
    requestId,
  };
  if (details !== undefined) {
    body.details = details;
  }
  if (status >= 500) {
    logger.error(message, { requestId, details });
  }
  return NextResponse.json(body, { status });
}

export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return apiError('Unauthorized', 401);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  logger.error(message, { context });
  return apiError('Internal server error', 500);
}
