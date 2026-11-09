import type { LanesSampleInput } from '../types.ts';
import { writeLanesSample } from '../write-lanes-sample.ts';
import { buildMockLanesSampleInput } from './build-mock-lanes-sample-input.ts';
import type { LanesDeps } from './types.ts';

export function seedLanesSample(deps: LanesDeps, input: Partial<LanesSampleInput> = {}): void {
  writeLanesSample(deps.db, buildMockLanesSampleInput(input));
}
