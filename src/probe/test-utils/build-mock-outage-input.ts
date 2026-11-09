import type { OutageInput } from '../types.ts';

export function buildMockOutageInput(overrides: Partial<OutageInput> = {}): OutageInput {
  return { startedAt: '2026-10-14T00:50:00Z', detectedAt: '2026-10-14T00:53:00Z', kind: 'down', ...overrides };
}
