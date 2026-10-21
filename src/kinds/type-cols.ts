import type { IssueType } from '../linear/issue-types.ts';
import { ISSUE_TYPES as TYPES } from '../linear/issue-types.ts';

// ---------- the stats section ----------

export const TYPE_COLS: IssueType[] = [...TYPES, 'none'];
