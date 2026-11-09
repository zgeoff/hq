import type { StoredAreaLabels } from '../area-labels-schema.ts';

export function buildMockAreaLabels(overrides: Partial<StoredAreaLabels> = {}): StoredAreaLabels {
  return { at: '2026-10-15T19:00:00Z', names: [], repoExists: {}, ...overrides };
}
