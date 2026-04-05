import { execSync } from 'child_process';
import type { ValidationStep, ValidationStepResult } from '../engine/types';
import { parseVitest, parseTsc, parseEslint } from './parsers';

const PARSERS = {
  vitest: parseVitest,
  tsc: parseTsc,
  eslint: parseEslint,
} as const;

export function runValidationStep(step: ValidationStep, cwd: string): ValidationStepResult {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = execSync(step.command, {
      cwd,
      timeout: (step.timeout || 120) * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    stdout = result.toString();
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    exitCode = execErr.status ?? 1;
    stdout = execErr.stdout?.toString() || '';
    stderr = execErr.stderr?.toString() || '';
  }

  const duration = Date.now() - startTime;
  const expectFail = step.expect === 'fail';
  const passed = expectFail ? exitCode !== 0 : exitCode === 0;

  const result: ValidationStepResult = {
    name: step.name,
    passed,
    exitCode,
    stdout: stdout.slice(-2000),
    stderr: stderr.slice(-2000),
    duration,
  };

  if (step.parser && PARSERS[step.parser]) {
    result.parsed = PARSERS[step.parser](stdout, stderr);
  }

  return result;
}
