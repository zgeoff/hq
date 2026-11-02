import type { DesignLanes } from './design-lanes.ts';

export function formatDesignLanes(design: DesignLanes): string {
  if (design.countsError !== null) {
    return `design: counts unreadable (${design.countsError}), using agent ${design.agent.slots}, with-geoff ${design.withGeoff.slots}`;
  }
  const agent = design.agent;
  const withGeoff = design.withGeoff;
  const agentNotes = agent.next.length === 0 ? [] : [`next ${agent.next.join(', ')}`];
  const waiting = withGeoff.open >= withGeoff.slots ? ', waiting' : '';
  const withGeoffNotes = [...(withGeoff.next.length === 0 ? [] : [`next ${withGeoff.next.join(', ')}${waiting}`]), ...(withGeoff.asked.length === 0 ? [] : [`asked: ${withGeoff.asked.join('; ')}`])];
  return `design: agent ${formatLane(agent, agentNotes)}, with-geoff ${formatLane(withGeoff, withGeoffNotes)}`;
}

interface LaneCount {
  open: number;
  slots: number;
}

function formatLane(lane: LaneCount, notes: readonly string[]): string {
  return `${lane.open}/${lane.slots}${notes.length === 0 ? '' : ` (${notes.join('; ')})`}`;
}
