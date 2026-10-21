import type { IssueType } from '../linear/issue-types.ts';
import type { Kind } from './kinds.ts';

export interface KindWeek {
  from: string; // Monday 00:00 Sydney
  to: string;
  partial: boolean; // the current week, so far
  total: number;
  kinds: Record<Kind, number>;
  bugShare: number | null; // fix PRs / all merged, percent
  missingDays: number; // days in the week with no record (not synced yet)
  prTypes: Record<IssueType, number>; // merged PRs by their Linear issue's type
  prUnlinked: number; // merged PRs naming no issue, or one hq has no type for yet
  prBugShare: number | null; // Bug / PRs with an issue, percent
  issues: Record<IssueType, number>; // issues completed this Sydney week, by type
  canceled: number;
  issueBugShare: number | null; // Bug / completed, percent
}
