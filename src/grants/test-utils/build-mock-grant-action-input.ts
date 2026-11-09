import type { GrantActionInput } from '../types.ts';

export function buildMockGrantActionInput(overrides: Partial<GrantActionInput> = {}): GrantActionInput {
  return { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot', ...overrides };
}
