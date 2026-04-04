import { z } from 'zod/v4';
import { NextResponse } from 'next/server';
import { apiError } from './api-error';

// --- Common primitives ---

export const uuidSchema = z.uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const runStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

// --- Workflow schemas ---

const graphDataSchema = z
  .unknown()
  .optional()
  .refine(
    (val) => !val || JSON.stringify(val).length <= 5_000_000,
    'Graph data too large (max 5MB)'
  );

export const createWorkflowSchema = z.object({
  name: z
    .string()
    .min(1, 'Workflow name is required')
    .max(200, 'Workflow name must be under 200 characters')
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(5000, 'Description must be under 5000 characters')
    .transform((s) => s.trim())
    .default(''),
  graphData: graphDataSchema,
  variables: z.record(z.string(), z.string()).optional().default({}),
});

export const updateWorkflowSchema = z.object({
  name: z
    .string()
    .min(1, 'Workflow name cannot be empty')
    .max(200, 'Workflow name must be under 200 characters')
    .transform((s) => s.trim())
    .optional(),
  description: z
    .string()
    .max(5000, 'Description must be under 5000 characters')
    .transform((s) => s.trim())
    .optional(),
  graphData: graphDataSchema,
  variables: z.record(z.string(), z.string()).optional(),
});

// --- Run schemas ---

export const listRunsQuerySchema = paginationSchema.extend({
  workflowId: uuidSchema.optional(),
  status: runStatusSchema.optional(),
});

export const cancelRunSchema = z.object({
  action: z.literal('cancel'),
});

// --- Parse helpers ---

function formatZodErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    (formatted[path] ??= []).push(issue.message);
  }
  return formatted;
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      response: apiError('Validation failed', 400, formatZodErrors(result.error)),
    };
  }
  return { success: true, data: result.data };
}

export function parseQuery<T>(
  schema: z.ZodType<T>,
  params: URLSearchParams
): { success: true; data: T } | { success: false; response: NextResponse } {
  const obj = Object.fromEntries(params.entries());
  return parseBody(schema, obj);
}

export function parseUuid(
  value: string,
  label = 'ID'
): { success: true } | { success: false; response: NextResponse } {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    return {
      success: false,
      response: apiError(`Invalid ${label}`, 400),
    };
  }
  return { success: true };
}
