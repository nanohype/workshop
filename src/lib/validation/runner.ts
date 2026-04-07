import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type { ValidationStep, ValidationStepResult } from '../engine/types';
import { parseVitest, parseTsc, parseEslint } from './parsers';

const exec = promisify(execCb);

const PARSERS = {
  vitest: parseVitest,
  tsc: parseTsc,
  eslint: parseEslint,
} as const;

export async function runValidationStep(step: ValidationStep, cwd: string): Promise<ValidationStepResult> {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    // Trust boundary: step.command comes from the workflow author who already has workspace access.
    // Validation steps are intentionally arbitrary shell commands (e.g., `npx vitest run`).
    const result = await exec(step.command, {
      cwd,
      timeout: (step.timeout || 120) * 1000,
      env: { ...process.env },
    });
    stdout = result.stdout;
  } catch (err: unknown) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string };
    exitCode = execErr.code ?? 1;
    stdout = execErr.stdout || '';
    stderr = execErr.stderr || '';
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
