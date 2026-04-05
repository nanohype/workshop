import type { ValidationStepResult } from '../engine/types';

type ParsedOutput = NonNullable<ValidationStepResult['parsed']>;

export function parseVitest(stdout: string, stderr: string): ParsedOutput {
  const combined = stdout + stderr;
  const passMatch = combined.match(/(\d+)\s+passed/);
  const failMatch = combined.match(/(\d+)\s+failed/);
  const totalMatch = combined.match(/Tests\s+(\d+)/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const total = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed;

  const errors: string[] = [];
  const failLines = combined.match(/FAIL\s+.+/g);
  if (failLines) errors.push(...failLines);

  return { total, passed, failed, errors };
}

export function parseTsc(stdout: string, stderr: string): ParsedOutput {
  const combined = stdout + stderr;
  const errorLines = combined.match(/error TS\d+:.+/g) || [];
  const failed = errorLines.length;

  return {
    total: failed || 1,
    passed: failed === 0 ? 1 : 0,
    failed,
    errors: errorLines,
  };
}

export function parseEslint(stdout: string, stderr: string): ParsedOutput {
  const combined = stdout + stderr;
  const summaryMatch = combined.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);

  if (summaryMatch) {
    const total = parseInt(summaryMatch[1], 10);
    const errorCount = parseInt(summaryMatch[2], 10);
    return {
      total,
      passed: errorCount === 0 ? 1 : 0,
      failed: errorCount,
      errors: errorCount > 0 ? [`${errorCount} errors, ${summaryMatch[3]} warnings`] : [],
    };
  }

  // No summary line = clean run
  return { total: 1, passed: 1, failed: 0, errors: [] };
}
