import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    // Force re-import to pick up new env vars
    vi.resetModules();
  });

  async function getLogger() {
    const mod = await import('../logger');
    return mod.logger;
  }

  it('logs at debug level by default', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.debug('test message');
    expect(console.debug).toHaveBeenCalledTimes(1);
  });

  it('filters messages below configured level', async () => {
    process.env.LOG_LEVEL = 'error';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('allows messages at or above configured level', async () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.warn('warning');
    logger.error('error');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('outputs JSON in prod environment', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.WORKSHOP_ENV = 'prod';
    const logger = await getLogger();
    logger.info('test', { requestId: 'abc-123' });
    const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test');
    expect(parsed.requestId).toBe('abc-123');
    expect(parsed.timestamp).toBeDefined();
  });

  it('outputs human-readable in local environment', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.info('hello world');
    const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('INFO');
    expect(output).toContain('hello world');
  });

  it('includes context in human-readable format', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.debug('request handled', { requestId: 'xyz', userId: 'u1' });
    const output = (console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(output).toContain('requestId=xyz');
    expect(output).toContain('userId=u1');
  });

  it('outputs JSON in staging environment', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.WORKSHOP_ENV = 'staging';
    const logger = await getLogger();
    logger.info('staging test');
    const output = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('staging test');
  });

  it('defaults to debug level for unknown LOG_LEVEL', async () => {
    process.env.LOG_LEVEL = 'invalid';
    process.env.WORKSHOP_ENV = 'local';
    const logger = await getLogger();
    logger.debug('should appear');
    expect(console.debug).toHaveBeenCalledTimes(1);
  });
});
