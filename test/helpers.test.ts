import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from './helpers.ts';

test('it opens a test database that skips the fsync on each commit', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  expect(fresh.db.query('PRAGMA synchronous').get()).toStrictEqual({ synchronous: 0 });
});
