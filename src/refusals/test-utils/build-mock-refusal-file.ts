import type { RefusalFileRow } from '../write-refusal-file.ts';

export function buildMockRefusalFile(overrides: Partial<RefusalFileRow> = {}): RefusalFileRow {
  return { path: '/t.jsonl', offset: 5, size: 9, mtime: '2026-10-14T03:00:00Z', tools: '[]', ...overrides };
}
