import type { StoredEvent } from '../read-events.ts';

export const CLEANUP_ACTIONS = ['handed-in-claim', 'handed-in-kept', 'handed-in-ended', 'merged-wrap-up', 'merged-wrap-up-retry', 'merged-wrap-up-result', 'design-done-close', 'design-done-close-result'] as const;

// A handed-in claim ends with its kept or ended event, and a merged-run, retry or design-done claim with its result.
export function isCleanupHeld(events: readonly StoredEvent[], at: Date): boolean {
  return (
    isOpenClaim(events, 'handed-in-claim', ['handed-in-kept', 'handed-in-ended'], at) ||
    isOpenClaim(events, 'merged-wrap-up', ['merged-wrap-up-result'], at) ||
    isOpenClaim(events, 'merged-wrap-up-retry', ['merged-wrap-up-result'], at) ||
    isOpenClaim(events, 'design-done-close', ['design-done-close-result'], at)
  );
}

// A cleanup reads each tree's work through an imp exec of up to 2 minutes, so a claim this old
// belongs to a sweep that died before it finished.
const CLAIM_STALE_MS = 10 * 60_000;

function isOpenClaim(events: readonly StoredEvent[], claim: string, ends: readonly string[], at: Date): boolean {
  const claimed = events.findLastIndex((event) => event.action === claim);
  const ended = events.findLastIndex((event) => ends.includes(event.action));
  const event = events[claimed];
  return event !== undefined && claimed > ended && Date.parse(event.at) > at.getTime() - CLAIM_STALE_MS;
}
