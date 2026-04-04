import { getQuickJS, type QuickJSWASMModule, type QuickJSContext } from 'quickjs-emscripten';
import { logger } from '@/lib/logger';

let quickJS: QuickJSWASMModule | null = null;

async function getRuntime(): Promise<QuickJSWASMModule> {
  if (!quickJS) {
    quickJS = await getQuickJS();
  }
  return quickJS;
}

export interface SandboxOptions {
  memoryLimitBytes?: number;
  timeLimitMs?: number;
  maxExpressionLength?: number;
}

const DEFAULTS: Required<SandboxOptions> = {
  memoryLimitBytes: 2 * 1024 * 1024,
  timeLimitMs: 1000,
  maxExpressionLength: 1000,
};

export async function evaluateExpression(
  expression: string,
  context: Record<string, unknown>,
  options?: SandboxOptions,
): Promise<boolean> {
  const opts = { ...DEFAULTS, ...options };

  if (expression.length > opts.maxExpressionLength) {
    logger.warn('Expression too long, rejected', { length: expression.length });
    return false;
  }

  const qjs = await getRuntime();
  const rt = qjs.newRuntime();
  let vm: QuickJSContext | undefined;

  try {
    rt.setMemoryLimit(opts.memoryLimitBytes);

    const deadline = Date.now() + opts.timeLimitMs;
    rt.setInterruptHandler(() => Date.now() > deadline);

    vm = rt.newContext();

    // Inject context via JSON round-trip (safe, strips functions/symbols)
    const contextJson = JSON.stringify(context, (_key, value) => {
      if (typeof value === 'function' || typeof value === 'symbol') return undefined;
      return value;
    });

    // Parse context inside sandbox and spread to globalThis
    const setupResult = vm.evalCode(
      `const __ctx = JSON.parse(${JSON.stringify(contextJson)});` +
      `for (const [k, v] of Object.entries(__ctx)) { globalThis[k] = v; }`
    );
    if (setupResult.error) {
      const err = vm.dump(setupResult.error);
      setupResult.error.dispose();
      logger.warn('Sandbox context setup failed', { error: String(err) });
      return false;
    }
    setupResult.value.dispose();

    // Evaluate the expression
    const result = vm.evalCode(`Boolean(${expression})`);

    if (result.error) {
      const errorVal = vm.dump(result.error);
      result.error.dispose();
      logger.warn('Sandbox evaluation error', { expression, error: String(errorVal) });
      return false;
    }

    const value = vm.dump(result.value);
    result.value.dispose();
    return Boolean(value);
  } catch (error) {
    logger.warn('Sandbox evaluation failed', { expression, error: String(error) });
    return false;
  } finally {
    vm?.dispose();
    rt.dispose();
  }
}
