import { seedLanesNudge } from './seed-lanes-nudge.ts';
import { seedLanesSample } from './seed-lanes-sample.ts';
import { seedReadyIssues } from './seed-ready-issues.ts';
import { seedSlotMinutes } from './seed-slot-minutes.ts';
import type { LanesDeps } from './types.ts';

export function buildLanesSeeder(deps: LanesDeps) {
  return {
    lanesSample: (input?: Parameters<typeof seedLanesSample>[1]) => seedLanesSample(deps, input),
    lanesNudge: (input?: Parameters<typeof seedLanesNudge>[1]) => seedLanesNudge(deps, input),
    slotMinutes: (input?: Parameters<typeof seedSlotMinutes>[1]) => seedSlotMinutes(deps, input),
    readyIssues: (issues: Parameters<typeof seedReadyIssues>[1]) => seedReadyIssues(deps, issues),
  };
}
