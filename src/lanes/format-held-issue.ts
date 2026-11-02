import type { HeldIssue } from './types.ts';

export function formatHeldIssue(held: HeldIssue): string {
  const blockers = held.blockers.map((blocker) => `${blocker.identifier} (In Progress, every PR merged ${blocker.lastMergedAt.slice(0, 10)})`).join(', ');
  const closing = held.blockers.map((blocker) => blocker.identifier).join(', ');
  return `Held: ${held.identifier} ${held.title}, blocked by ${blockers}: close ${closing}`;
}
