import type { DesignLanes } from './design-lanes.ts';
import type { OpenDesignRuns } from './count-open-design-runs.ts';
import type { DesignSlots } from './types.ts';

interface DesignLanesInput {
  slots: DesignSlots;
  open: OpenDesignRuns;

  // The issues each lane takes, in focus order, those with an open run already left out.
  agentQueue: readonly string[];
  withGeoffQueue: readonly string[];

  // Where the owner asked for each open with-geoff pass that was added above the lane count.
  asked: readonly string[];
}

export function buildDesignLanes(input: DesignLanesInput): DesignLanes {
  const agentFree = Math.max(0, input.slots.agent - input.open.agent);
  const withGeoffFree = Math.max(0, input.slots.withGeoff - input.open.withGeoff);
  const over = input.open.withGeoff > input.slots.withGeoff;
  return {
    agent: { open: input.open.agent, slots: input.slots.agent, next: input.agentQueue.slice(0, agentFree) },
    withGeoff: { open: input.open.withGeoff, slots: input.slots.withGeoff, next: input.withGeoffQueue.slice(0, Math.max(1, withGeoffFree)), asked: over ? [...input.asked] : [] },
  };
}
