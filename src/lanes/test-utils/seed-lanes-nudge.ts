import { seedEvent } from '../../test-utils/seed-event.ts';
import type { LanesNudgeInput } from '../types.ts';
import { writeLanesNudge } from '../write-lanes-nudge.ts';
import { buildMockLanesNudgeInput } from './build-mock-lanes-nudge-input.ts';
import type { LanesDeps } from './types.ts';

export function seedLanesNudge(deps: LanesDeps, input: Partial<Omit<LanesNudgeInput, 'eventSeq'>> = {}): number {
  return writeLanesNudge(deps.db, buildMockLanesNudgeInput({ ...input, eventSeq: seedEvent(deps) }));
}
