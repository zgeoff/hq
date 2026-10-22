import { ISSUE } from '../followups/issue.ts';
import type { LaneSkip } from './types.ts';

// A skip until a time holds while the time is ahead; a skip until an issue holds until the Ready
// tick reads that issue Done or Canceled and drops it.
export function isSkipActive(skip: LaneSkip, at: Date): boolean {
  return ISSUE.test(skip.until) || Date.parse(skip.until) > at.getTime();
}
