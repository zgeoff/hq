import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { kdb } from '../kdb.ts';
import { runSyncRow } from './run-sync-row.ts';

function setupTest() {
  const db = new Database(':memory:');
  onTestFinished(() => db.close());
  db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.run("INSERT INTO meta (key, value) VALUES ('a', '1'), ('b', '2'), ('c', '3')");
  return {
    db,
    schema: z.object({ key: z.string(), value: z.string() }),
    queryBefore: (key: string) => kdb(db).selectFrom('meta').select(['key', 'value']).where('key', '<', key).orderBy('key').compile(),
  };
}

test('it returns the first row of a compiled query, parsed', () => {
  const ctx = setupTest();

  expect(runSyncRow(ctx.db, ctx.queryBefore('c'), ctx.schema)).toStrictEqual({ key: 'a', value: '1' });
});

test('it returns null when the query has no row', () => {
  const ctx = setupTest();

  expect(runSyncRow(ctx.db, ctx.queryBefore('a'), ctx.schema)).toBeNull();
});
