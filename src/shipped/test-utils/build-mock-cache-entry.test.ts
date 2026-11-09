import { expect, test } from 'bun:test';
import { buildMockCacheEntry } from './build-mock-cache-entry.ts';

test('it builds a default kept issue that never expires', () => {
  expect(buildMockCacheEntry()).toStrictEqual({ kind: 'issue', key: 'GEO-9801', body: '{}', fetched_at: '2026-10-15T02:00:00Z', expires_at: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockCacheEntry({ kind: 'project', key: 'Kettle', expires_at: '2026-10-15T02:05:00Z' })).toStrictEqual({ kind: 'project', key: 'Kettle', body: '{}', fetched_at: '2026-10-15T02:00:00Z', expires_at: '2026-10-15T02:05:00Z' });
});
