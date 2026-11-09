import type { LanesNudgeInput } from '../types.ts';

export function buildMockLanesNudgeInput(overrides: Partial<LanesNudgeInput> = {}): LanesNudgeInput {
  return { at: '2026-10-16T01:01:00Z', slots: 2, freeMinutes: 10, eligible: 3, eventSeq: 1, detail: null, ...overrides };
}
