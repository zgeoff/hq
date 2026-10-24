import type { LanesCap } from './lanes-cap.ts';

export function isCapEnded(cap: LanesCap, at: Date): boolean {
  return cap.until !== null && Date.parse(cap.until) <= at.getTime();
}
