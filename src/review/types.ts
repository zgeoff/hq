import type { REVIEW_EFFORT } from './review-effort.ts';
import type { RISK_EFFORT } from './risk-effort.ts';

export type Effort = typeof REVIEW_EFFORT | typeof RISK_EFFORT;

export interface ReviewResult {
  repo: string;
  pr: number;
  head: string;
  base: string;
  reviewFile: string;
  codexCode: number;
  codexTail: string;
  effort: { effort: Effort; reason: string; forced: boolean };
  allowDeny: { code: number | null; answer: string; skipped: string | null };
  checks: { name: string; state: string; bucket?: string }[];

  // Why the checks could not be read, which leaves checks empty; null when they were read.
  checksError: string | null;
  openThreads: number | null;
  install: { ran: boolean; ok: boolean; detail: string };
}

export interface CIState {
  checks: ReviewResult['checks'];
  checksError: string | null;
  openThreads: number | null;
}
