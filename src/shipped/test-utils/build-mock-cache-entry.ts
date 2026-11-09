import type { ShippedCacheRow } from '../../kdb.ts';

export function buildMockCacheEntry(overrides: Partial<ShippedCacheRow> = {}): ShippedCacheRow {
  return { kind: 'issue', key: 'GEO-9801', body: '{}', fetched_at: '2026-10-15T02:00:00Z', expires_at: null, ...overrides };
}
