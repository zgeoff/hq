import type { IssueType } from '../linear/issue-types.ts';
import { TYPE_COLS } from './type-cols.ts';

export function isIssueType(value: string): value is IssueType {
  return TYPE_COLS.some((type) => type === value);
}
