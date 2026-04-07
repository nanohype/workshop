import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  paginationSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  listRunsQuerySchema,
  runActionSchema,
  parseBody,
  parseQuery,
  parseUuid,
} from '../validation';

describe('uuidSchema', () => {
  it('accepts valid UUIDs', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(uuidSchema.safeParse('a1b2c3d4-e5f6-7890-abcd-ef1234567890').success).toBe(true);
  });

  it('rejects non-UUIDs', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
    expect(uuidSchema.safeParse(123).success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('uses defaults when empty', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('coerces string values', () => {
    const result = paginationSchema.parse({ limit: '25', offset: '10' });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it('clamps limit to max 100', () => {
    expect(paginationSchema.safeParse({ limit: 200 }).success).toBe(false);
  });

  it('rejects negative offset', () => {
    expect(paginationSchema.safeParse({ offset: -1 }).success).toBe(false);
  });

  it('rejects limit of 0', () => {
    expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('createWorkflowSchema', () => {
  it('accepts valid workflow', () => {
    const result = createWorkflowSchema.parse({
      name: 'My Workflow',
      description: 'A description',
    });
    expect(result.name).toBe('My Workflow');
    expect(result.description).toBe('A description');
    expect(result.variables).toEqual({});
  });

  it('trims name', () => {
    const result = createWorkflowSchema.parse({ name: '  spaced  ' });
    expect(result.name).toBe('spaced');
  });

  it('rejects empty name', () => {
    expect(createWorkflowSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    expect(createWorkflowSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects description over 5000 chars', () => {
    expect(
      createWorkflowSchema.safeParse({ name: 'ok', description: 'x'.repeat(5001) }).success
    ).toBe(false);
  });

  it('rejects graph data over 5MB', () => {
    const big = { data: 'x'.repeat(5_000_001) };
    expect(
      createWorkflowSchema.safeParse({ name: 'ok', graphData: big }).success
    ).toBe(false);
  });

  it('defaults description and variables', () => {
    const result = createWorkflowSchema.parse({ name: 'test' });
    expect(result.description).toBe('');
    expect(result.variables).toEqual({});
  });
});

describe('updateWorkflowSchema', () => {
  it('accepts all optional', () => {
    const result = updateWorkflowSchema.parse({});
    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it('rejects empty name when provided', () => {
    expect(updateWorkflowSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts partial updates', () => {
    const result = updateWorkflowSchema.parse({ name: 'updated' });
    expect(result.name).toBe('updated');
    expect(result.description).toBeUndefined();
  });
});

describe('listRunsQuerySchema', () => {
  it('accepts valid status filter', () => {
    const result = listRunsQuerySchema.parse({ status: 'completed' });
    expect(result.status).toBe('completed');
  });

  it('rejects invalid status', () => {
    expect(listRunsQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  });

  it('validates workflowId as UUID', () => {
    expect(
      listRunsQuerySchema.safeParse({ workflowId: 'not-uuid' }).success
    ).toBe(false);
  });

  it('includes pagination defaults', () => {
    const result = listRunsQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });
});

describe('runActionSchema', () => {
  it('accepts cancel action', () => {
    expect(runActionSchema.parse({ action: 'cancel' })).toEqual({ action: 'cancel' });
  });

  it('rejects other actions', () => {
    expect(runActionSchema.safeParse({ action: 'restart' }).success).toBe(false);
  });
});

describe('parseBody', () => {
  it('returns success with parsed data', () => {
    const result = parseBody(runActionSchema, { action: 'cancel' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('cancel');
    }
  });

  it('returns 400 response on failure', () => {
    const result = parseBody(runActionSchema, { action: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe('parseQuery', () => {
  it('parses URLSearchParams', () => {
    const params = new URLSearchParams('limit=10&offset=5');
    const result = parseQuery(paginationSchema, params);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(5);
    }
  });
});

describe('parseUuid', () => {
  it('succeeds for valid UUID', () => {
    const result = parseUuid('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('fails with custom label', () => {
    const result = parseUuid('bad', 'workflow ID');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});
