import type { UnblockInput } from '../types.ts';

export function buildMockUnblockInput(overrides: Partial<UnblockInput> = {}): UnblockInput {
  return { id: 'descale', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage', ...overrides };
}
