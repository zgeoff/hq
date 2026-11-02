import { z } from 'zod';
import { buildMiss } from './build-miss.ts';
import { findRunFault } from './find-run-fault.ts';
import { formatIssue } from './format-issue.ts';
import { parseJSON } from './parse-json.ts';
import type { Judged } from './types.ts';

const AnchorSchema = z.object({ path: z.string(), startLine: z.number(), endLine: z.number() });
const FixCheckSchema = z.object({ findingID: z.string(), fixed: z.boolean(), reason: z.string() });
const NOSLOP_OUTPUT_VERSIONS: readonly number[] = [4, 5, 6, 7];
const NotReviewedSchema = z.object({ path: z.string(), reason: z.string() });
const ReviewFindingSchema = z.object({
  id: z.string(),
  lens: z.string(),
  severity: z.string(),
  title: z.string(),

  criterion: z.string().optional(),
  rule: z.string().optional(),
  anchor: AnchorSchema.optional(),
  writtenByChange: z.boolean().optional(),
});
const ReviewOutputSchema = z.object({
  version: z.number(),
  head: z.unknown(),
  base: z.unknown(),
  depth: z.unknown(),

  special: z.unknown().optional(),
  findings: z.array(ReviewFindingSchema),
  failedCalls: z.array(z.unknown()),

  notReviewed: z.array(NotReviewedSchema).optional(),

  fixChecks: z.array(FixCheckSchema).optional(),
});
const VersionSchema = z.object({ version: z.number() });

export type ReviewFinding = z.output<typeof ReviewFindingSchema>;

export type NotReviewedFile = z.output<typeof NotReviewedSchema>;

export type FixCheck = z.output<typeof FixCheckSchema>;

export interface ReviewOutput {
  head: string | null;
  base: string | null;
  depth: string | null;

  special: string | null;
  findings: ReviewFinding[];

  notReviewed: NotReviewedFile[];

  fixChecks: FixCheck[];
}

export function parseReviewRun(code: number, stdout: string, stderr: string, timeoutMs: number): Judged<ReviewOutput> {
  const fault = findRunFault(code, stderr, timeoutMs);
  const raw = parseJSON(stdout);
  if (fault !== null) {
    return buildMiss(fault);
  }
  if (raw === undefined) {
    return buildMiss('output is not JSON');
  }
  return parseReviewOutput(raw);
}

function parseReviewOutput(raw: unknown): Judged<ReviewOutput> {
  const version = VersionSchema.safeParse(raw);
  if (!version.success) {
    return buildMiss('output has no version');
  }
  if (!NOSLOP_OUTPUT_VERSIONS.includes(version.data.version)) {
    return buildMiss(`output version ${version.data.version}, hq reads versions ${formatVersions(NOSLOP_OUTPUT_VERSIONS)}`);
  }
  return parseReviewShape(raw, version.data.version);
}

function formatVersions(versions: readonly number[]): string {
  return `${versions.slice(0, -1).join(', ')} and ${versions.at(-1) ?? ''}`;
}

function parseReviewShape(raw: unknown, version: number): Judged<ReviewOutput> {
  const NOT_REVIEWED_SINCE = 6;
  const parsed = ReviewOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return buildMiss(`output does not fit its version at ${formatIssue(parsed.error)}`);
  }
  if (parsed.data.failedCalls.length > 0) {
    return buildMiss(`${parsed.data.failedCalls.length} noslop call(s) failed`, parsed.data.failedCalls.length);
  }
  if (version >= NOT_REVIEWED_SINCE && parsed.data.notReviewed === undefined) {
    return buildMiss(`output version ${version} has no notReviewed list`);
  }
  return { value: { head: toText(parsed.data.head), base: toText(parsed.data.base), depth: toText(parsed.data.depth), special: toText(parsed.data.special), findings: parsed.data.findings, notReviewed: parsed.data.notReviewed ?? [], fixChecks: parsed.data.fixChecks ?? [] }, why: null, failedCalls: 0 };
}

function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
