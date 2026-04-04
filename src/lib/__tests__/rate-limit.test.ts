import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const result = rateLimit('test-allow', 5);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks at the limit', () => {
    const key = 'test-block';
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3);
    }
    const result = rateLimit(key, 3);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks remaining count correctly', () => {
    const key = 'test-remaining';
    const max = 5;
    expect(rateLimit(key, max).remaining).toBe(4);
    expect(rateLimit(key, max).remaining).toBe(3);
    expect(rateLimit(key, max).remaining).toBe(2);
    expect(rateLimit(key, max).remaining).toBe(1);
    expect(rateLimit(key, max).remaining).toBe(0);
  });

  it('isolates different keys', () => {
    for (let i = 0; i < 3; i++) {
      rateLimit('key-a', 3);
    }
    // key-a is exhausted
    expect(rateLimit('key-a', 3).success).toBe(false);
    // key-b should still work
    expect(rateLimit('key-b', 3).success).toBe(true);
  });

  it('resets after window expires', () => {
    const key = 'test-reset';
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3);
    }
    expect(rateLimit(key, 3).success).toBe(false);

    // Advance time past the 60s window
    vi.advanceTimersByTime(61_000);

    const result = rateLimit(key, 3);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });
});
