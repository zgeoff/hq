import { z } from 'zod';
import { buildMiss } from './build-miss.ts';
import { findRunFault } from './find-run-fault.ts';
import { formatIssue } from './format-issue.ts';
import { parseJSON } from './parse-json.ts';
import type { Judged } from './types.ts';

const OpenFindingSchema = z.object({ id: z.string(), title: z.string(), reason: z.string() }),
  OutputCheckSchema = z.object({
    conclusion: z.enum(['success', 'failure']),
    title: z.string(),
    summary: z.string(),
    open: z.array(OpenFindingSchema),
  });

export type OpenFinding = z.output<typeof OpenFindingSchema>;
export type CheckOutput = z.output<typeof OutputCheckSchema>;

// What a finished `noslop check --json` run was: a conclusion, or the reason it was not one.
export function parseCheckRun(code: number, stdout: string, stderr: string, timeoutMs: number): Judged<CheckOutput> {
  const fault = findRunFault(code, stderr, timeoutMs),
    raw = parseJSON(stdout);
  if (fault !== null) {
    return buildMiss(fault);
  }
  if (raw === undefined) {
    return buildMiss('output is not JSON');
  }
  return parseCheckOutput(raw);
}

function parseCheckOutput(raw: unknown): Judged<CheckOutput> {
  const parsed = OutputCheckSchema.safeParse(raw);
  if (!parsed.success) {
    return buildMiss(`output does not fit at ${formatIssue(parsed.error)}`);
  }
  return { value: parsed.data, why: null, failedCalls: 0 };
}
