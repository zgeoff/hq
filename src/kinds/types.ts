import type { IssueType } from '../linear/issue-types.ts';
import type { Kind } from './kinds.ts';

export interface KindWeek {
  from: string;
  to: string;
  partial: boolean;
  total: number;
  kinds: Record<Kind, number>;
  bugShare: number | null;
  missingDays: number;
  prTypes: Record<IssueType, number>;
  prUnlinked: number;
  prBugShare: number | null;
  issues: Record<IssueType, number>;
  canceled: number;
  issueBugShare: number | null;
}
