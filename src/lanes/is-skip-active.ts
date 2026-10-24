import { ISSUE } from '../followups/issue.ts';
import { parsePRUntil } from './pr-until.ts';
import type { LaneSkip } from './types.ts';

// A skip until a time holds while the time is ahead; a skip until an issue or a PR holds until the
// Ready tick reads that issue Done or Canceled, or that PR merged or closed, and drops it.
export function isSkipActive(skip: LaneSkip, at: Date): boolean {
  return ISSUE.test(skip.until) || parsePRUntil(skip.until) !== null || Date.parse(skip.until) > at.getTime();
}
