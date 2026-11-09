import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedCacheEntry } from './seed-cache-entry.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readEntries: () => fresh.db.query('SELECT kind, key, body, fetched_at, expires_at FROM shipped_cache ORDER BY kind, key').all() };
}

test('#seedCacheEntry stores a kept entry, and input overrides apply', async () => {
  const ctx = setupTest();

  await seedCacheEntry(ctx, { kind: 'merged-day', key: '2026-10-14', body: '[]' });

  expect(ctx.readEntries()).toStrictEqual([{ kind: 'merged-day', key: '2026-10-14', body: '[]', fetched_at: '2026-10-15T02:00:00Z', expires_at: null }]);
});

test('#seedCacheEntry replaces the body an entry already holds', async () => {
  const ctx = setupTest();
  await seedCacheEntry(ctx, { body: '{"a":1}' });

  await seedCacheEntry(ctx, { body: '{"a":2}' });

  expect(ctx.readEntries()).toMatchObject([{ key: 'GEO-9801', body: '{"a":2}' }]);
});
