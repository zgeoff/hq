import type { GrantMarkInput } from '../types.ts';

export function buildMockGrantMarkInput(overrides: Partial<GrantMarkInput> = {}): GrantMarkInput {
  return { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot', ...overrides };
}
