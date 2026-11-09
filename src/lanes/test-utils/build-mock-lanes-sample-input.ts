import type { LanesSampleInput } from '../types.ts';

export function buildMockLanesSampleInput(overrides: Partial<LanesSampleInput> = {}): LanesSampleInput {
  return { at: '2026-10-16T01:00:00Z', freeMib: 0, slots: 0, eligible: null, error: null, ...overrides };
}
