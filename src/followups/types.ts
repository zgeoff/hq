import type { Mark } from '../marks/mark-kinds.ts';

export interface Followup {
  issue: string;
  from_ref: string | null;
  filed_at: string;
  source: 'final' | 'linear backfill';
  added_by: string;
  added_at: string;
}

// ---------- the stats section ----------

export interface WeekRow {
  week: number; // -2, -1 before the rule's mark; 1, 2, ... after
  from: string;
  to: string;
  partialDays: number | null; // the current week, so far
  followups: number;
  followupsBackfilled: number;
  fixed: number; // findings fixed in their own PR
  tallied: number; // PRs that reported a count
}

export interface ReviewStats {
  mark: Mark | null;
  weeks: WeekRow[];
  baseline: { followupsPerWeek: number; backfilled: number; fixed: 'none' | number };
}
