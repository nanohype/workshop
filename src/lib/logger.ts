type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL || 'debug';
  if (level in LEVEL_ORDER) return level as LogLevel;
  return 'debug';
}

function getEnv(): string {
  return process.env.WORKSHOP_ENV || 'local';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getLogLevel()];
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const env = getEnv();
  const timestamp = new Date().toISOString();

  if (env === 'prod' || env === 'staging') {
    // JSON output for structured log aggregation
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...context,
    });
  }

  // Human-readable for local/dev
  const prefix = `[${timestamp}] ${level.toUpperCase()}`;
  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    return `${prefix} ${message} ${contextStr}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!shouldLog('debug')) return;
    console.debug(formatMessage('debug', message, context));
  },

  info(message: string, context?: LogContext): void {
    if (!shouldLog('info')) return;
    console.info(formatMessage('info', message, context));
  },

  warn(message: string, context?: LogContext): void {
    if (!shouldLog('warn')) return;
    console.warn(formatMessage('warn', message, context));
  },

  error(message: string, context?: LogContext): void {
    if (!shouldLog('error')) return;
    console.error(formatMessage('error', message, context));
  },
};
