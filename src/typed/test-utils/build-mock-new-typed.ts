import type { NewTyped } from './types.ts';

export function buildMockNewTyped(overrides: Partial<NewTyped> = {}): NewTyped {
  return { to: 'z-invented', toId: null, toName: null, text: 'Descale it.', source: { kind: 'console', ref: 'descale-kettle', at: null }, actor: 'z-stu', ...overrides };
}
