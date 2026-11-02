import type { Mark } from '../marks/mark-kinds.ts';

export interface Followup {
  issue: string;
  from_ref: string | null;
  filed_at: string;
  source: 'final' | 'linear backfill' | 'review';
  added_by: string;
  added_at: string;
}

export interface WeekRow {
  week: number;
  from: string;
  to: string;
  partialDays: number | null;
  followups: number;
  followupsBackfilled: number;
  fixed: number;
  tallied: number;
}

export interface ReviewStats {
  mark: Mark | null;
  weeks: WeekRow[];
  baseline: { followupsPerWeek: number; backfilled: number; fixed: 'none' | number };
}
