import type { RefusalInput } from '../write-refusal.ts';

export function buildMockRefusal(overrides: Partial<RefusalInput> = {}): RefusalInput {
  return {
    uuid: 'u1',
    at: '2026-10-14T03:00:00Z',
    claude_session: null,
    transcript: '/t.jsonl',
    subagent: 0,
    cwd: null,
    atc_session: null,
    atc_name: null,
    tool: null,
    input: null,
    reason: null,
    scanned_at: '2026-10-14T04:00:00Z',
    ...overrides,
  };
}
