import type { HeldIssue } from './types.ts';

// "Held: GEO-1 Title, blocked by GEO-2 (In Progress, every PR merged 2026-10-13): close GEO-2".
export function formatHeldIssue(held: HeldIssue): string {
  const blockers = held.blockers.map((blocker) => `${blocker.identifier} (In Progress, every PR merged ${blocker.lastMergedAt.slice(0, 10)})`).join(', ');
  const closing = held.blockers.map((blocker) => blocker.identifier).join(', ');
  return `Held: ${held.identifier} ${held.title}, blocked by ${blockers}: close ${closing}`;
}
