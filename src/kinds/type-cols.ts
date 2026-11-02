import type { IssueType } from '../linear/issue-types.ts';
import { ISSUE_TYPES as TYPES } from '../linear/issue-types.ts';

export const TYPE_COLS: IssueType[] = [...TYPES, 'none'];
