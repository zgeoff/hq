import { getIssueAreas } from './get-issue-areas.ts';
import type { FocusEntry, FocusPick, FocusPlan, FocusReserve } from './types.ts';

// Fills the free slots from the queue. Each reserve first keeps its slots, less the area's running
// runs, for the area's first eligible issues; a reserved slot with nothing eligible is lent. Every
// slot left takes the queue in order.
export function buildFocusPlan(queue: readonly FocusEntry[], free: number, reserves: readonly FocusReserve[], runningByArea: Readonly<Record<string, number>>): FocusPlan {
  const picks: FocusPick[] = [];
  const lent: FocusPlan['lent'] = [];
  const taken = new Set<string>();
  for (const reserve of reserves) {
    const kept = Math.max(0, reserve.slots - (runningByArea[reserve.area] ?? 0));
    const room = Math.min(kept, free - picks.length);
    const inArea = queue.filter((entry) => !taken.has(entry.issue.identifier) && getIssueAreas(entry.issue.labels).includes(reserve.area)).slice(0, room);
    for (const entry of inArea) {
      taken.add(entry.issue.identifier);
      picks.push({ issue: entry.issue.identifier, term: entry.term, reserve: reserve.area });
    }
    if (inArea.length < room) {
      lent.push({ area: reserve.area, slots: room - inArea.length });
    }
  }
  const rest = queue.filter((entry) => !taken.has(entry.issue.identifier)).slice(0, Math.max(0, free - picks.length));
  return { picks: [...picks, ...rest.map((entry) => ({ issue: entry.issue.identifier, term: entry.term, reserve: null }))], lent };
}
