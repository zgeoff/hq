import type { ProbeSampleInput } from '../types.ts';

export function buildMockProbeSampleInput(overrides: Partial<ProbeSampleInput> = {}): ProbeSampleInput {
  return { at: '2026-10-14T00:59:00Z', targetOk: true, controlOk: null, durationMs: null, detail: null, readyOk: null, ...overrides };
}
