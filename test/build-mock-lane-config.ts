import type { LaneConfig } from '../src/areas/types.ts';

// A pacing.json lane: one local slot, unless given.
export function buildMockLaneConfig(name: string, over: Partial<LaneConfig> = {}): LaneConfig {
  return { name, place: 'local', size: 1, ...over };
}
