import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedMeta } from './seed-meta.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readMeta: () => fresh.db.query('SELECT key, value FROM meta ORDER BY key').all() };
}

test('#seedMeta stores a value under its key', () => {
  const ctx = setupTest();

  seedMeta(ctx, { key: 'invented_key', value: 'kettle' });

  expect(ctx.readMeta()).toStrictEqual([{ key: 'invented_key', value: 'kettle' }]);
});

test('#seedMeta replaces the value a key already holds', () => {
  const ctx = setupTest();
  seedMeta(ctx, { key: 'invented_key', value: 'kettle' });

  seedMeta(ctx, { key: 'invented_key', value: 'teapot' });

  expect(ctx.readMeta()).toStrictEqual([{ key: 'invented_key', value: 'teapot' }]);
});
