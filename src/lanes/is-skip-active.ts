import { ISSUE } from '../followups/issue.ts';
import { parsePRUntil } from './pr-until.ts';
import type { LaneSkip } from './types.ts';

export function isSkipActive(skip: LaneSkip, at: Date): boolean {
  return ISSUE.test(skip.until) || parsePRUntil(skip.until) !== null || Date.parse(skip.until) > at.getTime();
}
